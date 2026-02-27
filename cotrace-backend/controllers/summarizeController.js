// # controller for handling content summarization requests using claude api

const axios = require("axios");
const API_CONFIG = require("../config/apiConfig");

/**
 * # handle summarization of document content
 * @param {Object} req - express request object containing content and type
 * @param {Object} res - express response object for sending results
 * @returns {Object} json response with summarized content or error message
 * @description sends content to anthropic api for summarization and formats
 *              output as json schema with user and diff fields
 */
async function summarizeContent(req, res) {
  try {
    // # destructure content and file type from request body
    const { content, type } = req.body;

    // # validate that content is provided in request
    if (!content) {
      return res.status(400).json({ error: "content is required" });
    }

    // # construct prompt for claude to summarize with document type
    const prompt = `summarize the following ${type || "document"} version concisely:\n\n${content}`;

    // # call anthropic api with claude model and message configuration
    const response = await axios.post(
      API_CONFIG.baseURL,
      {
        // # specify model for text generation
        model: API_CONFIG.model,
        
        // # limit response length for summaries
        max_tokens: API_CONFIG.summaryMaxTokens,
        
        // # message array with user role and content
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        
        // # output configuration for json schema validation
        output_config: {
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                // # user field for user identification
                "user": { type: "string" },
                // # diff field as array of change descriptions
                "diff": { type: "array", items: { type: "string" } }
              },
              required: ["user", "diff"],
              additionalProperties: false
            }
          }
        }
      },
      {
        // # headers for anthropic api authentication and versioning
        headers: {
          "x-api-key": process.env.CLAUDE_API_KEY,
          "anthropic-version": API_CONFIG.apiVersion,
          "content-type": API_CONFIG.contentType
        }
      }
    );

    // # return successful response with extracted summary text
    res.json({ success: true, summary: response.data.content[0].text });
  } catch (error) {
    // # log error details for debugging
    console.error(error.response?.data || error.message);
    
    // # return error response with status code and details
    res.status(500).json({ 
      error: "failed to summarize", 
      details: error.message 
    });
  }
}

module.exports = {
  summarizeContent
};
