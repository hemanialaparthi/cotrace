// # routes for document summarization endpoints

const express = require("express");
const router = express.Router();
const { summarizeContent } = require("../controllers/summarizeController");

/**
 * # post endpoint for summarizing document content
 * @route POST /summarize
 * @param {string} req.body.content - the content to summarize
 * @param {string} req.body.type - the type of document being summarized
 * @returns {Object} json response with summary or error
 * @description processes document content through claude api
 *              and returns concise summary in json format
 */
router.post("/summarize", summarizeContent);

module.exports = router;
