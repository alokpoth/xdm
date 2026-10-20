/**
 * XDM Turbo Official Vercel Serverless Functions Handler
 * Routes all /api/* requests to the unified Express licensing & governance server.
 */

const { app } = require('../license-server/server');

module.exports = app;
