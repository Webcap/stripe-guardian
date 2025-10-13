/**
 * Health check endpoint for Stripe Guardian
 * Returns basic health status
 */

module.exports = async (req, res) => {
  // Handle CORS - set on all responses
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400' // 24 hours
  };
  
  // Set CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405, { 
      'Content-Type': 'application/json',
      ...corsHeaders
    });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  res.writeHead(200, { 
    'Content-Type': 'application/json',
    ...corsHeaders
  });
  res.end(JSON.stringify({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    service: 'Stripe Guardian',
    status: 'healthy'
  }));
};
