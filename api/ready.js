/**
 * Ready check endpoint for Stripe Guardian
 * Returns the readiness status of all services
 */

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

export default async function handler(req, res) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const readiness = { 
    ok: true, 
    timestamp: new Date().toISOString(),
    service: 'Stripe Guardian',
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
    if (process.env.STRIPE_SECRET_KEY) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2024-06-20'
      });
      await stripe.products.list({ limit: 1 });
      readiness.checks.stripe = true;
    } else {
      readiness.checks.stripe = false;
    }
  } catch (e) {
    readiness.ok = false;
    readiness.checks.stripe = false;
    readiness.errors = readiness.errors || [];
    readiness.errors.push(`Stripe: ${e.message}`);
  }
  
  // Check Supabase connection
  try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      await supabase.from('premium_plans').select('id').limit(1);
      readiness.checks.supabase = true;
    } else {
      readiness.checks.supabase = false;
    }
  } catch (e) {
    readiness.ok = false;
    readiness.checks.supabase = false;
    readiness.errors = readiness.errors || [];
    readiness.errors.push(`Supabase: ${e.message}`);
  }
  
  return res.status(readiness.ok ? 200 : 503).json(readiness);
}
