require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

app.post("/summarize", async (req, res) => {
  try {
    const { content } = req.body;

    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-3-haiku-20240307",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: `Summarize the following document version:\n\n${content}`
          }
        ]
      },
      {
        headers: {
          "x-api-key": process.env.CLAUDE_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        }
      }
    );

    res.json({ summary: response.data.content[0].text });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: "Failed to summarize" });
  }
});

app.get("/", (req, res) => {
  res.send("CoTrace backend running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));