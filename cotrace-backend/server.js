require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

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

    res.json({ success: true, summary: response.data.content[0].text });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: "Failed to summarize", details: error.message });
  }
});

// New endpoint for natural language queries about changes
app.post("/query-changes", async (req, res) => {
  try {
    const { query, fileId, fileTitle, fileType, revisions } = req.body;

    if (!query || !revisions) {
      return res.status(400).json({ error: "Query and revisions are required" });
    }

    // Filter revisions and prepare summary for AI
    const revisionSummary = prepareRevisionSummary(revisions);

    const systemPrompt = `You are an expert assistant analyzing document changes. You help users understand what changes were made to a document based on their queries. 

The user is asking about changes to: "${fileTitle}" (${fileType})

Here is the revision history data:
${revisionSummary}

Based on this revision data, answer the user's question about changes. Be specific with dates, contributors, and what changed. If the user mentions a specific date, filter the results accordingly.`;

    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 800,
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
    res.json({ success: true, answer });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: "Failed to process query", details: error.message });
  }
});

// Helper function to prepare revision data for AI analysis
function prepareRevisionSummary(revisions) {
  if (!revisions || !revisions.revisions || revisions.revisions.length === 0) {
    return "No revision history available.";
  }

  const revisionList = revisions.revisions
    .slice(0, 50) // Limit to last 50 revisions to avoid token limits
    .map((rev, index) => {
      const date = new Date(rev.modifiedTime).toLocaleString();
      const author = rev.lastModifyingUser?.displayName || "Unknown";
      return `${index + 1}. ${date} - Last modified by: ${author} (Revision ID: ${rev.id})`;
    })
    .join("\n");

  return `Total revisions: ${revisions.revisions.length}\n\nRevision history (most recent first):\n${revisionList}`;
}

app.get("/", (req, res) => {
  res.send("CoTrace backend running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));