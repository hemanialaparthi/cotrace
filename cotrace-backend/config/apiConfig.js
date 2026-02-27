// # configuration file for external api settings and constants

// # anthropic api configuration for claude model access
const API_CONFIG = {
  // # base url for anthropic api endpoints
  baseURL: "https://api.anthropic.com/v1/messages",
  
  // # claude model identifier for text generation
  model: "claude-sonnet-4-5-20250929",
  
  // # maximum tokens to generate in summarization responses
  summaryMaxTokens: 500,
  
  // # maximum tokens for query responses about changes
  queryMaxTokens: 800,
  
  // # api version for anthropic compatibility
  apiVersion: "2023-06-01",
  
  // # content type for json requests
  contentType: "application/json"
};

module.exports = API_CONFIG;
