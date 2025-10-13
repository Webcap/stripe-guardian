/**
 * Test server.js locally to debug issues
 */

// Set minimal env vars for testing
process.env.PORT = 3002;
process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_placeholder';
process.env.SUPABASE_URL = 'https://placeholder.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'placeholder_key';

console.log('🧪 Starting test server...\n');

// Try to load and start the server
try {
  require('./server.js');
  
  setTimeout(() => {
    console.log('\n✅ Server started successfully!');
    console.log('Testing health endpoint...\n');
    
    const http = require('http');
    const req = http.get('http://localhost:3002/api/health', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('📊 Health check response:');
        console.log(data);
        process.exit(0);
      });
    });
    
    req.on('error', (err) => {
      console.error('❌ Health check failed:', err.message);
      process.exit(1);
    });
  }, 1000);
  
} catch (error) {
  console.error('❌ Server failed to start:', error.message);
  console.error('\nFull error:');
  console.error(error);
  process.exit(1);
}

