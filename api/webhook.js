/**
 * Stripe webhook server for handling subscription events
 * This server processes Stripe webhooks and updates user premium status
 */

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// Initialize clients
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20'
});

export default async function handler(req, res) {
  // Handle CORS properly
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Stripe-Signature');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Health check endpoint
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/api/health')) {
    return res.status(200).json({ 
      ok: true, 
      timestamp: new Date().toISOString(),
      service: 'Stripe Guardian Webhook'
    });
  }
  
  // Ready check endpoint
  if (req.method === 'GET' && (req.url === '/ready' || req.url === '/api/ready')) {
    const readiness = { 
      ok: true, 
      timestamp: new Date().toISOString(),
      checks: {} 
    };
    
    // Check environment variables
    readiness.checks.env = {
      STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: !!process.env.STRIPE_WEBHOOK_SECRET,
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
    
    // Check Stripe connection
    try {
      await stripe.products.list({ limit: 1 });
      readiness.checks.stripe = true;
    } catch (e) {
      readiness.ok = false;
      readiness.checks.stripe = false;
      readiness.errors = readiness.errors || [];
      readiness.errors.push(`Stripe: ${e.message}`);
    }
    
    // Check Supabase connection
    try {
      await supabase.from('premium_plans').select('id').limit(1);
      readiness.checks.supabase = true;
    } catch (e) {
      readiness.ok = false;
      readiness.checks.supabase = false;
      readiness.errors = readiness.errors || [];
      readiness.errors.push(`Supabase: ${e.message}`);
    }
    
    return res.status(readiness.ok ? 200 : 503).json(readiness);
  }

  // Handle webhook POST requests
  if (req.method === 'POST') {
    try {
      const signature = req.headers['stripe-signature'];
      if (!signature || typeof signature !== 'string') {
        return res.status(400).json({ error: 'Missing Stripe-Signature header' });
      }

      const rawBody = req.body;
      const event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);

      // For now, just acknowledge the webhook
      // You can add your webhook processing logic here
      console.log('Received Stripe webhook:', event.type);
      
      return res.status(200).json({ 
        received: true, 
        event_type: event.type,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('Webhook handling error:', err?.message || err);
      return res.status(400).json({ 
        error: 'Webhook Error',
        message: err.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Method not allowed
  return res.status(405).json({ 
    error: 'Method not allowed',
    allowed_methods: ['GET', 'POST', 'OPTIONS'],
    timestamp: new Date().toISOString()
  });
}

