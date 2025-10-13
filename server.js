/**
 * Stripe Guardian API Server
 * 
 * Simple HTTP server that routes requests to API handlers
 * Compatible with Docker and cloud deployments
 */

const http = require('http');
const PORT = process.env.PORT || process.env.APPLICATION_PORT || 8080;

// Route mapping for API endpoints
const routes = {
  '/': './api/index.js',
  '/api': './api/index.js',
  '/api/health': './api/health.js',
  '/api/ready': './api/ready.js',
  '/api/test': './api/test.js',
  '/api/webhook': './api/webhook.js',
  '/api/stripe/webhook': './api/stripe/webhook.js',
  '/api/stripe/sync-plan': './api/stripe/sync-plan.js',
  '/api/stripe/create-checkout': './api/stripe/create-checkout.js',
  '/api/stripe/verify-session': './api/stripe/verify-session.js',
  '/api/stripe/create-customer': './api/stripe/create-customer.js',
  '/api/stripe/create-paymentsheet': './api/stripe/create-paymentsheet.js',
  '/api/stripe/confirm-paymentsheet': './api/stripe/confirm-paymentsheet.js',
  '/api/stripe/cancel-subscription': './api/stripe/cancel-subscription.js',
  '/api/stripe/reactivate-subscription': './api/stripe/reactivate-subscription.js',
};

const server = http.createServer(async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Get request body
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const url = req.url || '/';
      console.log(`${req.method} ${url}`);

      // Store raw body (needed for webhook signature verification)
      req.rawBody = body;
      
      // Parse body if present
      if (body) {
        try {
          req.body = JSON.parse(body);
        } catch (e) {
          req.body = body;
        }
      }

      // Find handler for route
      let handler;
      if (routes[url]) {
        // Exact match
        handler = require(routes[url]);
      } else {
        // Try catchall
        handler = require('./api/[...catchall].js');
      }

      // Call handler
      await handler(req, res);
    } catch (error) {
      console.error('Request error:', error);
      
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Internal server error',
          details: error.message 
        }));
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Stripe Guardian API Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📍 Ready check: http://localhost:${PORT}/api/ready`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

