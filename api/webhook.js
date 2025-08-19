/**
 * Stripe webhook server for handling subscription events
 * This server processes Stripe webhooks and updates user premium status
 * 
 * NEW: Double subscription prevention - prevents users from creating multiple
 * subscriptions when their premium status hasn't activated yet
 */
require('dotenv/config');
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

// Import the webhook handling logic from your existing server
const { handleStripeEvent } = require('../server/webhook-server.js');

export default async function handler(req, res) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Stripe-Signature');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  // Health check endpoints
  if (req.method === 'GET') {
    if (req.url === '/health' || req.url === '/api/health') {
      return res.status(200).json({ ok: true });
    }
    
    if (req.url === '/ready' || req.url === '/api/ready') {
      const readiness = { ok: true, checks: {} };
      readiness.checks.env = {
        STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
        STRIPE_WEBHOOK_SECRET: !!process.env.STRIPE_WEBHOOK_SECRET,
        SUPABASE_URL: !!process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      };
      
      try {
        await stripe.products.list({ limit: 1 });
        readiness.checks.stripe = true;
      } catch (e) {
        readiness.ok = false;
        readiness.checks.stripe = false;
      }
      
      try {
        await supabase.from('premium_plans').select('id').limit(1);
        readiness.checks.supabase = true;
      } catch (e) {
        readiness.ok = false;
        readiness.checks.supabase = false;
      }
      
      return res.status(readiness.ok ? 200 : 503).json(readiness);
    }
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

      await handleStripeEvent(event, stripe);
      return res.status(200).json({ received: true });
    } catch (err) {
      console.error('Webhook handling error:', err?.message || err);
      return res.status(400).json({ error: 'Webhook Error' });
    }
  }

  // Method not allowed
  return res.status(405).json({ error: 'Method not allowed' });
}
