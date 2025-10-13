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

// Initialize Supabase client for main app database
const mainAppSupabase = createClient(
  process.env.WIZNOTE_SUPABASE_URL,
  process.env.WIZNOTE_SUPABASE_SERVICE_KEY
);

// Webhook handler functions
async function handleSubscriptionCreated(subscription) {
  try {
    console.log(`📅 Subscription created: ${subscription.id} for customer ${subscription.customer}`);
    
    // Find user by Stripe customer ID
    const { data: user, error: userError } = await mainAppSupabase
      .from('user_profiles')
      .select('id')
      .eq('stripe_customer_id', subscription.customer)
      .single();

    if (userError || !user) {
      console.log(`⚠️  No user found for customer ${subscription.customer}`);
      return;
    }

    // Update user's premium status
    const premiumData = {
      isActive: subscription.status === 'active' || subscription.status === 'trialing',
      status: subscription.status,
      stripeSubscriptionId: subscription.id,
      currentPeriodStart: subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : null,
      currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
      updatedAt: new Date().toISOString()
    };

    const { error: updateError } = await mainAppSupabase
      .from('user_profiles')
      .update({
        premium: premiumData,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error(`❌ Error updating user ${user.id} premium status:`, updateError);
    } else {
      console.log(`✅ Updated user ${user.id} premium status: ${subscription.status}`);
    }
  } catch (error) {
    console.error('❌ Error handling subscription created:', error);
  }
}

async function handleSubscriptionUpdated(subscription) {
  try {
    console.log(`📅 Subscription updated: ${subscription.id} for customer ${subscription.customer}, Status: ${subscription.status}`);
    
    // Find user by Stripe customer ID
    const { data: user, error: userError } = await mainAppSupabase
      .from('user_profiles')
      .select('id')
      .eq('stripe_customer_id', subscription.customer)
      .single();

    if (userError || !user) {
      console.log(`⚠️  No user found for customer ${subscription.customer}`);
      return;
    }

    // Update user's premium status
    const premiumData = {
      isActive: subscription.status === 'active' || subscription.status === 'trialing',
      status: subscription.status,
      stripeSubscriptionId: subscription.id,
      currentPeriodStart: subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : null,
      currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
      updatedAt: new Date().toISOString()
    };

    const { error: updateError } = await mainAppSupabase
      .from('user_profiles')
      .update({
        premium: premiumData,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error(`❌ Error updating user ${user.id} subscription status:`, updateError);
    } else {
      console.log(`✅ Updated user ${user.id} subscription status: ${subscription.status}`);
    }
  } catch (error) {
    console.error('❌ Error handling subscription updated:', error);
  }
}

async function handleSubscriptionDeleted(subscription) {
  try {
    console.log(`🗑️  Subscription deleted: ${subscription.id} for customer ${subscription.customer}`);
    
    // Find user by Stripe customer ID
    const { data: user, error: userError } = await mainAppSupabase
      .from('user_profiles')
      .select('id')
      .eq('stripe_customer_id', subscription.customer)
      .single();

    if (userError || !user) {
      console.log(`⚠️  No user found for customer ${subscription.customer}`);
      return;
    }

    // Deactivate user's premium status
    const premiumData = {
      isActive: false,
      status: 'canceled',
      stripeSubscriptionId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      updatedAt: new Date().toISOString()
    };

    const { error: updateError } = await mainAppSupabase
      .from('user_profiles')
      .update({
        premium: premiumData,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error(`❌ Error deactivating user ${user.id} premium status:`, updateError);
    } else {
      console.log(`✅ Deactivated user ${user.id} premium status`);
    }
  } catch (error) {
    console.error('❌ Error handling subscription deleted:', error);
  }
}

async function handlePaymentSucceeded(invoice) {
  try {
    console.log(`💰 Payment succeeded for invoice: ${invoice.id}`);
    // Payment succeeded events are handled by subscription updates
    // This is mainly for logging and additional processing if needed
  } catch (error) {
    console.error('❌ Error handling payment succeeded:', error);
  }
}

async function handlePaymentFailed(invoice) {
  try {
    console.log(`💳 Payment failed for invoice: ${invoice.id}`);
    // Payment failed events are handled by subscription updates
    // This is mainly for logging and additional processing if needed
  } catch (error) {
    console.error('❌ Error handling payment failed:', error);
  }
}

module.exports = async (req, res) => {
  // Handle CORS properly
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Stripe-Signature');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check endpoint
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/api/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      ok: true, 
      timestamp: new Date().toISOString(),
      service: 'Stripe Guardian Webhook'
    }));
    return;
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
      WIZNOTE_SUPABASE_URL: !!process.env.WIZNOTE_SUPABASE_URL,
      WIZNOTE_SUPABASE_SERVICE_KEY: !!process.env.WIZNOTE_SUPABASE_SERVICE_KEY,
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
    
    // Check Supabase connection (local)
    try {
      await supabase.from('premium_plans').select('id').limit(1);
      readiness.checks.supabase = true;
    } catch (e) {
      readiness.ok = false;
      readiness.checks.supabase = false;
      readiness.errors = readiness.errors || [];
      readiness.errors.push(`Supabase (local): ${e.message}`);
    }
    
    // Check main app Supabase connection
    try {
      await mainAppSupabase.from('user_profiles').select('id').limit(1);
      readiness.checks.mainAppSupabase = true;
    } catch (e) {
      readiness.ok = false;
      readiness.checks.mainAppSupabase = false;
      readiness.errors = readiness.errors || [];
      readiness.errors.push(`Main App Supabase: ${e.message}`);
    }
    
    res.writeHead(readiness.ok ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readiness));
    return;
  }

  // Handle webhook POST requests
  if (req.method === 'POST') {
    try {
      const signature = req.headers['stripe-signature'];
      if (!signature || typeof signature !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing Stripe-Signature header' }));
        return;
      }

      const rawBody = req.body;
      const event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);

      console.log('Received Stripe webhook:', event.type);
      
      // Process different webhook events
      switch (event.type) {
        case 'customer.subscription.created':
          await handleSubscriptionCreated(event.data.object);
          break;
        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event.data.object);
          break;
        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object);
          break;
        case 'invoice.payment_succeeded':
          await handlePaymentSucceeded(event.data.object);
          break;
        case 'invoice.payment_failed':
          await handlePaymentFailed(event.data.object);
          break;
        default:
          console.log(`Unhandled webhook event type: ${event.type}`);
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        received: true, 
        event_type: event.type,
        processed: true,
        timestamp: new Date().toISOString()
      }));
      return;
    } catch (err) {
      console.error('Webhook handling error:', err?.message || err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Webhook Error',
        message: err.message,
        timestamp: new Date().toISOString()
      }));
      return;
    }
  }

  // Method not allowed
  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ 
    error: 'Method not allowed',
    allowed_methods: ['GET', 'POST', 'OPTIONS'],
    timestamp: new Date().toISOString()
  }));
};

