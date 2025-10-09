const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// Initialize Stripe and Supabase clients
let stripe, supabase;

try {
  console.log('Environment variables check:');
  console.log('STRIPE_SECRET_KEY exists:', !!process.env.STRIPE_SECRET_KEY);
  console.log('SUPABASE_URL exists:', !!process.env.SUPABASE_URL);
  console.log('SUPABASE_SERVICE_ROLE_KEY exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { 
    apiVersion: '2024-06-20' 
  });
  console.log('Stripe client initialized successfully');
  
  supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
  console.log('Supabase client initialized successfully');
} catch (initError) {
  console.error('Error initializing clients:', initError);
  // We'll handle this in the main function
}

// CORS headers for cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

const handler = async (req, res) => {
  console.log('Confirm PaymentSheet handler called');
  console.log('Request method:', req.method);
  console.log('Request URL:', req.url);
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    res.writeHead(200, corsHeaders);
    res.end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    res.writeHead(405, corsHeaders);
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  try {
    // Check if clients are properly initialized
    if (!stripe || !supabase) {
      console.error('Clients not initialized properly');
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ 
        error: 'Service not properly initialized',
        details: 'Payment service is temporarily unavailable'
      }));
      return;
    }

    const { paymentIntentId, planId, userId } = req.body || {};
    
    console.log('Confirming PaymentSheet:', { paymentIntentId, planId, userId });
    
    if (!paymentIntentId || !planId || !userId) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: 'Missing required fields: paymentIntentId, planId, userId' }));
      return;
    }

    // Retrieve the payment intent
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (!paymentIntent || paymentIntent.status !== 'succeeded') {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: 'Payment not completed' }));
      return;
    }

    // Get plan details
    const { data: plan, error: planErr } = await supabase
      .from('premium_plans')
      .select('stripe_price_id, price, interval')
      .eq('id', planId)
      .single();

    if (planErr || !plan) {
      res.writeHead(404, corsHeaders);
      res.end(JSON.stringify({ error: 'Plan not found' }));
      return;
    }

    // Get the payment method from the successful payment intent
    const paymentMethod = paymentIntent.payment_method;
    
    if (!paymentMethod) {
      console.error('No payment method found on payment intent');
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: 'Payment method not found' }));
      return;
    }
    
    console.log('Creating subscription with payment method:', paymentMethod);
    
    // Create subscription using the payment method from the payment intent
    // Use default_payment_method to ensure subscription is active immediately
    const subscription = await stripe.subscriptions.create({
      customer: paymentIntent.customer,
      items: [{ price: plan.stripe_price_id }],
      default_payment_method: paymentMethod,
      payment_behavior: 'error_if_incomplete', // Fail if payment can't be completed
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: { 
        planId,
        userId,
        source: 'paymentsheet'
      }
    });
    
    console.log('Subscription created:', {
      id: subscription.id,
      status: subscription.status,
      customer: subscription.customer
    });

    // Update user premium status - use same fields as webhook for consistency
    console.log('Updating user premium status for userId:', userId);
    console.log('Subscription details:', {
      id: subscription.id,
      status: subscription.status,
      customer: paymentIntent.customer
    });
    
    const { error: updErr } = await supabase
      .from('user_profiles')
      .update({
        is_premium: true,
        subscription_id: subscription.id,
        subscription_status: subscription.status,
        stripe_customer_id: paymentIntent.customer,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updErr) {
      console.error('Error updating user premium status:', updErr);
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ error: 'Failed to update user status', details: updErr.message }));
      return;
    }
    
    console.log('Successfully updated user premium status for userId:', userId);

    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({ 
      success: true,
      subscriptionId: subscription.id,
      message: 'Subscription created successfully'
    }));
  } catch (e) {
    console.error('Confirm PaymentSheet error:', e?.message || e);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ error: 'Failed to confirm payment' }));
  }
};

module.exports = handler;
