// # routes for health check and status endpoints

const express = require("express");
const router = express.Router();

/**
 * # get endpoint for health check and server status
 * @route GET /
 * @returns {string} simple text response indicating server is running
 * @description used to verify that the backend server is running and
 *              responding to requests correctly
 */
router.get("/", (req, res) => {
  res.send("cotrace backend running");
});

module.exports = router;
