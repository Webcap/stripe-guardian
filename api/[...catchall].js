// Catch-all handler for malformed URLs and 404s
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

module.exports = async (req, res) => {
  try {
    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.writeHead(200, corsHeaders);
      res.end();
      return;
    }

    // Debug logging to understand request structure
    console.log('Catchall handler - req object keys:', Object.keys(req));
    console.log('Catchall handler - req.url:', req.url);
    console.log('Catchall handler - req.method:', req.method);

    // Get the URL path from req.url (Vercel environment)
    const pathname = req.url || '/';
  
    // Ensure pathname is a string and handle double slash issues (e.g., /api//stripe/create-customer)
    if (typeof pathname === 'string' && pathname.includes('//')) {
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
        '/api/ready',
        '/api/test'
      ]
    }));
  } catch (error) {
    console.error('Catchall handler error:', error);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({
      error: 'Internal server error in catchall handler',
      details: error.message
    }));
  }
};
