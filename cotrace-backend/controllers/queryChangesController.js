// # controller for handling natural language queries about document changes

const axios = require("axios");
const API_CONFIG = require("../config/apiConfig");
const { prepareRevisionSummary } = require("../utils/revisionHelper");

/**
 * # process natural language queries about document revisions
 * @param {Object} req - express request with query, revisions, and file metadata
 * @param {Object} res - express response object for sending results
 * @returns {Object} json response with ai-generated analysis or error
 * @description analyzes document revision history to answer user questions
 *              about what changed, who changed it, and when changes occurred
 */
async function queryDocumentChanges(req, res) {
  try {
    // # destructure query and revision data from request body
    const { query, fileId, fileTitle, fileType, revisions } = req.body;

    // # validate required fields for processing
    if (!query || !revisions) {
      return res.status(400).json({ 
        error: "query and revisions are required" 
      });
    }

    // # prepare revision data formatted for ai analysis
    const revisionSummary = prepareRevisionSummary(revisions);

    // # construct system prompt with context about file and revisions
    const systemPrompt = `you are an expert assistant analyzing document changes. you help users understand what changes were made to a document based on their queries.

the user is asking about changes to: "${fileTitle}" (${fileType})

here is the revision history data:
${revisionSummary}

based on this revision data, answer the user's question about changes. be specific with dates, contributors, and what changed. if the user mentions a specific date, filter the results accordingly.`;

    // # call anthropic api with query and revision context
    const response = await axios.post(
      API_CONFIG.baseURL,
      {
        // # specify claude model for analysis
        model: API_CONFIG.model,
        
        // # allow more tokens for detailed change analysis
        max_tokens: API_CONFIG.queryMaxTokens,
        
        // # message with user query
        messages: [
          {
            role: "user",
            content: query
          }
        ],
        
        // # system prompt provides context for document analysis
        system: systemPrompt
      },
      {
        // # headers for api authentication and configuration
        headers: {
          "x-api-key": process.env.CLAUDE_API_KEY,
          "anthropic-version": API_CONFIG.apiVersion,
          "content-type": API_CONFIG.contentType
        }
      }
    );

    // # extract and return the ai-generated answer
    const answer = response.data.content[0].text;
    res.json({ success: true, answer });
  } catch (error) {
    // # log error details for debugging and monitoring
    console.error(error.response?.data || error.message);
    
    // # return error response with failure details
    res.status(500).json({ 
      error: "failed to process query", 
      details: error.message 
    });
  }
}

module.exports = {
  queryDocumentChanges
};
