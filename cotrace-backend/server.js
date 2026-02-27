// # main server entry point for cotrace backend application
// # initializes express server and configures all routes and middleware

require("dotenv").config();
const express = require("express");
const cors = require("cors");

// # import all route modules for organizing endpoints
const healthRoutes = require("./routes/healthRoutes");
const summarizeRoutes = require("./routes/summarizeRoutes");
const queryRoutes = require("./routes/queryRoutes");

// # initialize express application instance
const app = express();

// # MIDDLEWARE CONFIGURATION
// # ========================

// # enable cross-origin resource sharing for frontend access
app.use(cors());

// # parse incoming json request bodies automatically
app.use(express.json());

// # ROUTE REGISTRATION
// # ==================

// # health check endpoint for server status verification
app.use(healthRoutes);

// # document summarization endpoints
app.use(summarizeRoutes);

// # document change query endpoints
app.use(queryRoutes);

// # ERROR HANDLING
// # ==============

/**
 * # catch-all error handler for unhandled routes
 * @param {Object} req - express request object
 * @param {Object} res - express response object
 * @description returns 404 error when route is not found
 */
app.use((req, res) => {
  res.status(404).json({ error: "route not found" });
});

// # SERVER INITIALIZATION
// # ====================

// # read port from environment variables with default fallback
const PORT = process.env.PORT || 3000;

// # start server and listen for incoming connections
app.listen(PORT, () => {
  console.log(`cotrace backend server running on port ${PORT}`);
});