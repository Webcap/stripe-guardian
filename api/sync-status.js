/**
 * Subscription sync status endpoint
 * Returns current sync status and allows manual sync triggers
 */

const subscriptionSync = require('../services/subscription-sync');

module.exports = async (req, res) => {
  // Handle CORS - set on all responses
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

  // GET: Return sync status
  if (req.method === 'GET') {
    try {
      const status = subscriptionSync.getStatus();
      
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        ...corsHeaders
      });
      res.end(JSON.stringify({
        ok: true,
        sync: status,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      res.writeHead(500, { 
        'Content-Type': 'application/json',
        ...corsHeaders
      });
      res.end(JSON.stringify({ 
        ok: false,
        error: error.message 
      }));
    }
    return;
  }

  // POST: Trigger manual sync
  if (req.method === 'POST') {
    try {
      console.log('📞 Manual sync triggered via API');
      
      // Trigger sync without waiting for it to complete
      subscriptionSync.performSync().catch(err => {
        console.error('Manual sync error:', err);
      });
      
      res.writeHead(202, { 
        'Content-Type': 'application/json',
        ...corsHeaders
      });
      res.end(JSON.stringify({ 
        ok: true,
        message: 'Sync triggered',
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      res.writeHead(500, { 
        'Content-Type': 'application/json',
        ...corsHeaders
      });
      res.end(JSON.stringify({ 
        ok: false,
        error: error.message 
      }));
    }
    return;
  }

  // Method not allowed
  res.writeHead(405, { 
    'Content-Type': 'application/json',
    ...corsHeaders
  });
  res.end(JSON.stringify({ error: 'Method not allowed' }));
};

