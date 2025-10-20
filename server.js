/**
 * Stripe Guardian API Server
 * 
 * Simple HTTP server that routes requests to API handlers
 * Compatible with Docker and cloud deployments
 */

const http = require('http');
const subscriptionSync = require('./services/subscription-sync');
const PORT = process.env.PORT || process.env.APPLICATION_PORT || 8080;

// Route mapping for API endpoints
const routes = {
  '/': './api/index.js',
  '/api': './api/index.js',
  '/api/health': './api/health.js',
  '/api/ready': './api/ready.js',
  '/api/sync-status': './api/sync-status.js',
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
  '/api/stripe/get-billing-history': './api/stripe/get-billing-history.js',
  // Promotion endpoints
  '/api/stripe/create-coupon': './api/stripe/create-coupon.js',
  '/api/stripe/create-promotion-code': './api/stripe/create-promotion-code.js',
  '/api/stripe/create-discounted-price': './api/stripe/create-discounted-price.js',
  '/api/stripe/validate-coupon': './api/stripe/validate-coupon.js',
};

const server = http.createServer(async (req, res) => {
  // Set CORS headers - Allow all origins for development and production
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

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

      // Extract pathname without query parameters
      const pathname = url.split('?')[0].split('#')[0];

      // Find handler for route
      let handler;
      if (routes[pathname]) {
        // Exact match
        handler = require(routes[pathname]);
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
  
  // Start automatic subscription sync
  if (process.env.STRIPE_SECRET_KEY && process.env.SUPABASE_URL) {
    try {
      subscriptionSync.start();
    } catch (error) {
      console.error('⚠️  Failed to start subscription sync:', error.message);
    }
  } else {
    console.warn('⚠️  Subscription sync disabled: Missing required environment variables');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  subscriptionSync.stop();
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  subscriptionSync.stop();
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

