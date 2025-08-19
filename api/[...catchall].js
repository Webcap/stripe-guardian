// Catch-all handler for malformed URLs and 404s
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

module.exports = async (req, res) => {
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    res.end();
    return;
  }

  const { pathname } = req;
  
  // Handle double slash issues (e.g., /api//stripe/create-customer)
  if (pathname.includes('//')) {
    const cleanPath = pathname.replace(/\/+/g, '/');
    
    // Redirect to clean path
    res.writeHead(301, {
      ...corsHeaders,
      'Location': cleanPath
    });
    res.end(JSON.stringify({
      error: 'URL corrected',
      originalPath: pathname,
      correctedPath: cleanPath,
      message: 'Please use the corrected URL'
    }));
    return;
  }

  // Handle 404 for unknown endpoints
  res.writeHead(404, corsHeaders);
  res.end(JSON.stringify({
    error: 'Endpoint not found',
    path: pathname,
    message: 'This API endpoint does not exist. Please check the URL and try again.',
    availableEndpoints: [
      '/api/stripe/webhook',
      '/api/stripe/sync-plan',
      '/api/stripe/create-checkout',
      '/api/stripe/verify-session',
      '/api/stripe/create-customer',
      '/api/stripe/create-paymentsheet',
      '/api/health',
      '/api/ready'
    ]
  }));
};
