/**
 * Shared CORS configuration for Stripe Guardian API
 * Used by all endpoints that accept cross-origin requests from WizNote and admin dashboards
 */

const ALLOWED_ORIGINS = [
  'https://wiznote.app',
  'https://stripe.webcap.media',
  'https://webcap.media',
  'http://localhost:8081',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];

const DEFAULT_ORIGIN = 'https://wiznote.app';

/**
 * Get CORS headers for a request, using the request's Origin if it's allowed
 * @param {import('http').IncomingMessage} req
 * @returns {{ [key: string]: string }}
 */
function getCorsHeaders(req) {
  const origin = req.headers.origin;
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : DEFAULT_ORIGIN;

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };
}

module.exports = {
  ALLOWED_ORIGINS,
  DEFAULT_ORIGIN,
  getCorsHeaders,
};
