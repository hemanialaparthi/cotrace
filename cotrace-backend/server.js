require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const markdown = require('markdown-it');
const { createPatch } = require('diff');

const app = express();
app.use(cors());
app.use(express.json());

// Helper function to stream Claude API responses
async function streamClaudeResponse(systemPrompt, userMessage, res, timing) {
  try {
    const timingState = timing || {};
    timingState.metaEmitted = timingState.metaEmitted || {};

    const buildMeta = (phase) => {
      const requestStart = timingState.requestStart || null;
      const revisionsFetchedAt = timingState.revisionsFetchedAt || null;
      const diffsBuiltAt = timingState.diffsBuiltAt || null;
      const firstChunkAt = timingState.firstChunkAt || null;
      const streamEndAt = timingState.streamEndAt || null;

      const durations = {
        fetchMs: requestStart && revisionsFetchedAt ? revisionsFetchedAt - requestStart : null,
        diffMs: revisionsFetchedAt && diffsBuiltAt ? diffsBuiltAt - revisionsFetchedAt : null,
        toFirstChunkMs: requestStart && firstChunkAt ? firstChunkAt - requestStart : null,
        totalStreamMs: firstChunkAt && streamEndAt ? streamEndAt - firstChunkAt : null,
        totalMs: requestStart && streamEndAt ? streamEndAt - requestStart : null
      };

      return {
        phase,
        timestamps: {
          requestStart,
          revisionsFetchedAt,
          diffsBuiltAt,
          firstChunkAt,
          streamEndAt
        },
        durations,
        sizes: timingState.sizes || {}
      };
    };

    const emitMeta = (phase) => {
      if (timingState.metaEmitted[phase]) {
        return;
      }
      timingState.metaEmitted[phase] = true;
      res.write(`data: ${JSON.stringify({ meta: buildMeta(phase) })}\n\n`);
    };

    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 2000,
        stream: true,
        messages: [
          {
            role: "user",
            content: userMessage
          }
        ],
        system: systemPrompt
      },
      {
        headers: {
          "x-api-key": process.env.CLAUDE_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        },
        responseType: 'stream'
      }
    );

    // Set response headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Handle the stream
    response.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      
      lines.forEach((line) => {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            // Send content_block_delta events
            if (data.type === 'content_block_delta') {
              const delta = data.delta;
              if (delta.type === 'text_delta' && delta.text) {
                if (!timingState.firstChunkAt) {
                  timingState.firstChunkAt = Date.now();
                  emitMeta('first_chunk');
                }
                // Send the text chunk as an SSE message
                res.write(`data: ${JSON.stringify({ text: delta.text })}\n\n`);
              }
            }
            // Send message_stop event to signal end
            else if (data.type === 'message_stop') {
              if (!timingState.streamEndAt) {
                timingState.streamEndAt = Date.now();
                emitMeta('done');
              }
              res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            }
          } catch (e) {
            console.error('Error parsing streaming data:', e);
          }
        }
      });
    });

    response.data.on('end', () => {
      if (!timingState.streamEndAt) {
        timingState.streamEndAt = Date.now();
        emitMeta('end');
      }
      if (!res.writableEnded) {
        res.end();
      }
    });

    response.data.on('error', (error) => {
      console.error('Stream error:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    });
  } catch (error) {
    console.error('Streaming error:', error.message);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
}

app.post("/summarize", async (req, res) => {
  try {
    const { content, type } = req.body;

    if (!content) {
      return res.status(400).json({ error: "Content is required" });
    }

    const prompt = `Summarize the following ${type || 'document'} version concisely:\n\n${content}`;

    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        output_config: {
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                'user': {type: 'string'},
                'diff': {type: 'array' , items: {type: 'string'}}
              },
              required: ['user', 'diff'],
              additionalProperties: false
            }
          },
        }
      },
      {
        headers: {
          "x-api-key": process.env.CLAUDE_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        }
      }
    );
    md = new markdown();
    res.json({ success: true, summary: md.render(response.data.content[0].text) });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: "Failed to summarize", details: error.message });
  }
});

// Fetch actual content from a revision using Google Drive API
async function fetchRevisionContentFromGoogle(fileId, revisionId, authToken) {
  try {
    console.log(`[FETCH] Fetching content for revision ${revisionId}`);
    
    // Get revision metadata to find export links
    const revisionRes = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${fileId}/revisions/${revisionId}?fields=*`,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }
    );

    const revisionData = revisionRes.data;
    console.log(`[FETCH] Revision ${revisionId} metadata:`, {
      mimeType: revisionData.mimeType,
      hasExportLinks: !!revisionData.exportLinks,
      exportLinks: Object.keys(revisionData.exportLinks || {}),
      hasWebContentLink: !!revisionData.webContentLink
    });

    const exportUrl = revisionData.exportLinks?.['text/plain'] || 
                      revisionData.exportLinks?.['text/html'] ||
                      revisionData.webContentLink;

    if (!exportUrl) {
      console.log(`[FETCH] ✗ No export link available for revision ${revisionId}`);
      return null;
    }

    console.log(`[FETCH] Using export URL for revision ${revisionId}: ${exportUrl.substring(0, 80)}...`);

    // Fetch the actual content
    const contentRes = await axios.get(exportUrl, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    console.log(`[FETCH] ✓ Successfully fetched ${contentRes.data.length} chars for revision ${revisionId}`);
    return contentRes.data;
  } catch (error) {
    console.error(`[FETCH] ✗ Error fetching revision ${revisionId}:`, error.message);
    if (error.response?.status) {
      console.error(`[FETCH] HTTP Status: ${error.response.status}`);
    }
    return null;
  }
}

// New endpoint for natural language queries about changes (STREAMING)
app.post("/query-changes-stream", async (req, res) => {
  try {
    const { query, fileId, fileTitle, fileType, revisions, authToken } = req.body;

    if (!query || !revisions || !authToken) {
      return res.status(400).json({ error: "Query, revisions, and authToken are required" });
    }

    const timing = {
      requestStart: Date.now(),
      revisionsFetchedAt: null,
      diffsBuiltAt: null,
      firstChunkAt: null,
      streamEndAt: null,
      sizes: {}
    };

    console.log(`[QUERY-STREAM] Processing query: "${query}"`);
    console.log(`[TOKEN] Auth token received (length: ${authToken.length})`);
    console.log(`[REVISIONS] Total revisions received: ${revisions.revisions?.length || 0}`);

    // Optimize: Only analyze recent revisions for performance
    const REVISIONS_TO_ANALYZE = 20;
    const revisionsToAnalyze = revisions.revisions.slice(0, REVISIONS_TO_ANALYZE);
    console.log(`[QUERY-STREAM] Analyzing ${revisionsToAnalyze.length} recent revisions (out of ${revisions.revisions.length} total)`);
    
    // Fetch actual content for each revision (PARALLEL for speed)
    console.log(`[FETCH] Starting parallel content fetch for ${revisionsToAnalyze.length} revisions...`);
    const revisionContents = {};
    const fetchPromises = revisionsToAnalyze.map(async (revision) => {
      const content = await fetchRevisionContentFromGoogle(fileId, revision.id, authToken);
      revisionContents[revision.id] = {
        content: content || '[Content unavailable]',
        date: revision.modifiedTime,
        author: revision.lastModifyingUser?.displayName || 'Unknown'
      };
    });
    
    // Wait for all requests to complete
    await Promise.all(fetchPromises);
    timing.revisionsFetchedAt = Date.now();
    console.log(`[FETCH] Parallel fetch complete for all ${revisionsToAnalyze.length} revisions`);

    // Generate diffs between consecutive revisions
    const diffs = [];
    const revisionIds = revisionsToAnalyze.map(r => r.id);
    for (let i = 0; i < revisionIds.length - 1; i++) {
      const newer = revisionContents[revisionIds[i]].content || '';
      const older = revisionContents[revisionIds[i + 1]].content || '';
      const diff = createPatch(
        fileTitle,
        older.toString(),
        newer.toString(),
        'Previous',
        'Current'
      );
      diffs.push({
        from: revisionIds[i + 1],
        to: revisionIds[i],
        date: revisionContents[revisionIds[i]].date,
        author: revisionContents[revisionIds[i]].author,
        diff: diff
      });
    }

    console.log(`[SUMMARY] Generated ${diffs.length} diffs from ${revisionsToAnalyze.length} revisions`);
    timing.diffsBuiltAt = Date.now();

    // Prepare detailed content summary for AI
    const contentSummary = diffs.map(d => 
      `\n=== Change on ${new Date(d.date).toLocaleString()} by ${d.author} ===\n${d.diff}`
    ).join('\n');

    // Improved system prompt with intelligent analysis guidance
    const systemPrompt = `You are an expert document analyst. Your job is to help users understand documents by analyzing their change history.

Document: "${fileTitle}" (${fileType})
Total Revisions: ${revisions.revisions.length}
Analyzing: ${revisionsToAnalyze.length} recent revisions

ANALYSIS GUIDELINES:
1. For questions about "what is this document about" or similar overview questions:
   - Synthesize the content into 2-3 key themes/purposes
   - Highlight the most important sections or recurring topics
   - Provide a high-level executive summary (2-3 sentences max)
   - Then list 3-5 main purposes/topics in bullet points
   - Avoid listing every small detail

2. For specific questions about changes, timelines, or contributors:
   - Be precise with dates and names
   - Show actual content changes with specific examples
   - Highlight what was added, removed, or modified

3. For all responses:
   - Start with the most relevant/important information
   - Use clear structure with headers
   - Group related information together
   - Avoid raw data dumps - synthesize and summarize

Here are the content changes (diffs between consecutive versions):
${contentSummary || 'No changes available'}

Now answer the user's question based on this document history. Focus on intelligence and clarity over exhaustive detail.`;

    timing.sizes = {
      queryChars: (query || '').length,
      revisionsAnalyzed: revisionsToAnalyze.length,
      revisionsTotal: revisions.revisions.length,
      diffsCount: diffs.length,
      contentSummaryChars: contentSummary.length,
      systemPromptChars: systemPrompt.length
    };

    // Stream the response from Claude
    await streamClaudeResponse(systemPrompt, query, res, timing);
  } catch (error) {
    console.error(`[ERROR] Query streaming failed:`, error.message);
    res.status(500).json({ error: "Failed to process query", details: error.message });
  }
});

// New endpoint for natural language queries about changes
app.post("/query-changes", async (req, res) => {
  try {
    const { query, fileId, fileTitle, fileType, revisions, authToken } = req.body;

    if (!query || !revisions || !authToken) {
      return res.status(400).json({ error: "Query, revisions, and authToken are required" });
    }

    console.log(`[QUERY] Processing query: "${query}"`);
    console.log(`[TOKEN] Auth token received (length: ${authToken.length})`);
    console.log(`[REVISIONS] Raw revisions object structure:`, Object.keys(revisions));
    console.log(`[REVISIONS] revisions.revisions type:`, typeof revisions.revisions);
    console.log(`[REVISIONS] revisions.revisions count:`, revisions.revisions?.length);
    console.log(`[REVISIONS] Total revisions received: ${revisions.revisions?.length || 0}`);

    // Optimize: Only analyze recent revisions for performance
    // For better performance, limit to last 20 revisions (most recent changes)
    const REVISIONS_TO_ANALYZE = 20;
    const revisionsToAnalyze = revisions.revisions.slice(0, REVISIONS_TO_ANALYZE);
    console.log(`[QUERY] Analyzing ${revisionsToAnalyze.length} recent revisions (out of ${revisions.revisions.length} total) for performance`);
    
    // Fetch actual content for each revision (PARALLEL for speed)
    console.log(`[FETCH] Starting parallel content fetch for ${revisionsToAnalyze.length} revisions...`);
    const revisionContents = {};
    const fetchPromises = revisionsToAnalyze.map(async (revision) => {
      const content = await fetchRevisionContentFromGoogle(fileId, revision.id, authToken);
      revisionContents[revision.id] = {
        content: content || '[Content unavailable]',
        date: revision.modifiedTime,
        author: revision.lastModifyingUser?.displayName || 'Unknown'
      };
      
      if (content) {
        console.log(`[FETCH] ✓ Revision ${revision.id}: ${content.length} chars`);
      } else {
        console.log(`[FETCH] ✗ Revision ${revision.id}: content unavailable`);
      }
    });
    
    // Wait for all requests to complete
    await Promise.all(fetchPromises);
    console.log(`[FETCH] Parallel fetch complete for all ${revisionsToAnalyze.length} revisions`);

    // Generate diffs between consecutive revisions
    const diffs = [];
    const revisionIds = revisionsToAnalyze.map(r => r.id);
    for (let i = 0; i < revisionIds.length - 1; i++) {
      const newer = revisionContents[revisionIds[i]].content || '';
      const older = revisionContents[revisionIds[i + 1]].content || '';
      const diff = createPatch(
        fileTitle,
        older.toString(),
        newer.toString(),
        'Previous',
        'Current'
      );
      diffs.push({
        from: revisionIds[i + 1],
        to: revisionIds[i],
        date: revisionContents[revisionIds[i]].date,
        author: revisionContents[revisionIds[i]].author,
        diff: diff
      });
    }

    console.log(`[SUMMARY] Generated ${diffs.length} diffs from ${revisionsToAnalyze.length} revisions`);
    const successCount = Object.values(revisionContents).filter(r => r.content !== '[Content unavailable]').length;
    console.log(`[SUMMARY] Successfully fetched content for ${successCount}/${revisionsToAnalyze.length} revisions`);

    // Prepare detailed content summary for AI
    const contentSummary = diffs.map(d => 
      `\n=== Change on ${new Date(d.date).toLocaleString()} by ${d.author} ===\n${d.diff}`
    ).join('\n');

    // Improved system prompt with intelligent analysis guidance
    const systemPrompt = `You are an expert document analyst. Your job is to help users understand documents by analyzing their change history.

Document: "${fileTitle}" (${fileType})
Total Revisions: ${revisions.revisions.length}
Analyzing: ${revisionsToAnalyze.length} recent revisions

ANALYSIS GUIDELINES:
1. For questions about "what is this document about" or similar overview questions:
   - Synthesize the content into 2-3 key themes/purposes
   - Highlight the most important sections or recurring topics
   - Provide a high-level executive summary (2-3 sentences max)
   - Then list 3-5 main purposes/topics in bullet points
   - Avoid listing every small detail

2. For specific questions about changes, timelines, or contributors:
   - Be precise with dates and names
   - Show actual content changes with specific examples
   - Highlight what was added, removed, or modified

3. For all responses:
   - Start with the most relevant/important information
   - Use clear structure with headers
   - Group related information together
   - Avoid raw data dumps - synthesize and summarize

Here are the content changes (diffs between consecutive versions):
${contentSummary || 'No changes available'}

Now answer the user's question based on this document history. Focus on intelligence and clarity over exhaustive detail.`;

    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: query
          }
        ],
        system: systemPrompt
      },
      {
        headers: {
          "x-api-key": process.env.CLAUDE_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        }
      }
    );

    const answer = response.data.content[0].text;
    console.log(`[SUMMARY] Query processed successfully`);
    console.log(`[SUMMARY] Total revisions: ${revisions.revisions.length}, Analyzed: ${revisionsToAnalyze.length}, Diffs generated: ${diffs.length}`);
    
    res.json({ success: true, answer });
  } catch (error) {
    console.error(`[ERROR] Query processing failed:`, error.response?.data || error.message);
    res.status(500).json({ error: "Failed to process query", details: error.message });
  }
});

// New endpoint for comparing two specific versions
app.post("/compare-versions", async (req, res) => {
  try {
    const { fileId, fileTitle, revisions, version1Id, version2Id, authToken } = req.body;

    if (!fileId || !version1Id || !version2Id || !authToken) {
      return res.status(400).json({ error: "fileId, version1Id, version2Id, and authToken are required" });
    }

    console.log(`[COMPARE] Comparing versions: ${version1Id} -> ${version2Id}`);

    // Fetch content for both versions
    console.log(`[COMPARE] Fetching content for version 1: ${version1Id}`);
    const content1 = await fetchRevisionContentFromGoogle(fileId, version1Id, authToken);
    
    console.log(`[COMPARE] Fetching content for version 2: ${version2Id}`);
    const content2 = await fetchRevisionContentFromGoogle(fileId, version2Id, authToken);

    if (!content1 && !content2) {
      return res.status(500).json({ error: "Could not fetch content for either version" });
    }

    // Generate unified diff
    const diff = createPatch(
      fileTitle,
      content1 || '',
      content2 || '',
      'Earlier Version',
      'Latest Version'
    );

    // Calculate statistics
    const diffLines = diff.split('\n');
    let additions = 0;
    let deletions = 0;

    diffLines.forEach(line => {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        deletions++;
      }
    });

    const totalChanges = additions + deletions;

    console.log(`[COMPARE] Diff stats - Additions: ${additions}, Deletions: ${deletions}, Total: ${totalChanges}`);

    // Generate AI summary of changes
    const summary = await generateChangesSummary(
      fileTitle,
      content1 || '[Content unavailable]',
      content2 || '[Content unavailable]',
      diff,
      additions,
      deletions
    );

    console.log(`[COMPARE] Generated AI summary successfully`);

    res.json({
      success: true,
      diff: diff,
      stats: {
        additions,
        deletions,
        totalChanges
      },
      summary: summary
    });
  } catch (error) {
    console.error(`[COMPARE] Error:`, error.response?.data || error.message);
    res.status(500).json({ error: "Failed to compare versions", details: error.message });
  }
});

// Generate AI summary of changes between two versions
async function generateChangesSummary(fileTitle, content1, content2, diff, additions, deletions) {
  try {
    const systemPrompt = `You are an expert document analyst specializing in summarizing changes between document versions. Your task is to provide a clear, concise summary of what changed between an earlier version and a latest version of a document.

Focus on:
1. Main topics or sections that were added, removed, or significantly modified
2. Key insights about the nature of changes (restructuring, expansion, clarification, deletion, etc.)
3. Any notable patterns or trends in the edits

Be concise and specific - avoid listing every single change. Instead, synthesize information to highlight the most important modifications.`;

    const userPrompt = `Compare these two versions of "${fileTitle}" and summarize the changes:

EARLIER VERSION:
${content1.substring(0, 2000)}${content1.length > 2000 ? '\n... (content truncated) ...' : ''}

LATEST VERSION:
${content2.substring(0, 2000)}${content2.length > 2000 ? '\n... (content truncated) ...' : ''}

UNIFIED DIFF:
${diff.substring(0, 1500)}${diff.length > 1500 ? '\n... (diff truncated) ...' : ''}

CHANGE STATISTICS:
- Additions: ${additions} lines
- Deletions: ${deletions} lines
- Total Changes: ${additions + deletions} lines

Provide a brief, clear summary of what changed. Focus on high-level changes and key modifications.`;

    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: userPrompt
          }
        ],
        system: systemPrompt
      },
      {
        headers: {
          "x-api-key": process.env.CLAUDE_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        }
      }
    );

    return response.data.content[0].text;
  } catch (error) {
    console.error(`[COMPARE] Failed to generate summary:`, error.message);
    // Return a fallback summary if AI fails
    return `Unable to generate AI summary. However, the comparison shows **${additions} additions** and **${deletions} deletions** between the two versions.`;
  }
}

app.get("/", (req, res) => {
  res.send("CoTrace backend running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));