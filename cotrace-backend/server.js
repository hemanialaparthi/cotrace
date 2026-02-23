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
                'diff': {type: 'string'}
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

app.get("/", (req, res) => {
  res.send("CoTrace backend running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));