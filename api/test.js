module.exports = async (req, res) => {
  console.log('Test endpoint called');
  console.log('Request method:', req.method);
  console.log('Request URL:', req.url);
  
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  
  res.end(JSON.stringify({
    success: true,
    message: 'Test endpoint working',
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url
  }));
};
