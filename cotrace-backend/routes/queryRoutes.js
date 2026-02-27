// # routes for document change query endpoints

const express = require("express");
const router = express.Router();
const { queryDocumentChanges } = require("../controllers/queryChangesController");

/**
 * # post endpoint for querying document changes with natural language
 * @route POST /query-changes
 * @param {string} req.body.query - the question about document changes
 * @param {string} req.body.fileId - the id of the document file
 * @param {string} req.body.fileTitle - the title of the document
 * @param {string} req.body.fileType - the type of document
 * @param {Object} req.body.revisions - revision history from google docs
 * @returns {Object} json response with analysis or error
 * @description analyzes document revision history to understand and
 *              explain what changes were made and who made them
 */
router.post("/query-changes", queryDocumentChanges);

module.exports = router;
