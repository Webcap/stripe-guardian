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

    const { setupIntentId, paymentIntentId, planId, userId, stripePriceId } = req.body || {};
    
    console.log('Confirming PaymentSheet:', { setupIntentId, paymentIntentId, planId, userId, stripePriceId });
    
    // Support both old (paymentIntentId) and new (setupIntentId) for backward compatibility
    const intentId = setupIntentId || paymentIntentId;
    
    if (!intentId || !planId || !userId) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: 'Missing required fields: setupIntentId/paymentIntentId, planId, userId' }));
      return;
    }

    // Retrieve the setup intent to get the payment method
    let paymentMethod, customerId;
    
    if (setupIntentId) {
      // New flow: using SetupIntent
      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      
      if (!setupIntent || setupIntent.status !== 'succeeded') {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'Payment method not saved' }));
        return;
      }
      
      paymentMethod = setupIntent.payment_method;
      customerId = setupIntent.customer;
      console.log(`SetupIntent succeeded, payment method: ${paymentMethod}`);
    } else {
      // Old flow: using PaymentIntent (for backward compatibility)
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (!paymentIntent || paymentIntent.status !== 'succeeded') {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'Payment not completed' }));
        return;
      }
      
      paymentMethod = paymentIntent.payment_method;
      customerId = paymentIntent.customer;
      console.log(`PaymentIntent succeeded, payment method: ${paymentMethod}`);
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

    if (!paymentMethod) {
      console.error('No payment method found');
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: 'Payment method not found' }));
      return;
    }
    
    console.log('Creating subscription with payment method:', paymentMethod);
    
    // Use stripePriceId from request body if available, otherwise from plan
    const priceId = stripePriceId || plan.stripe_price_id;
    
    // Create subscription using the payment method
    // The subscription will handle the first charge automatically
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      default_payment_method: paymentMethod,
      payment_settings: { 
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card'] 
      },
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
      customer: subscription.customer,
      latest_invoice_status: subscription.latest_invoice?.status
    });

    // Update user premium status
    console.log('Updating user premium status for userId:', userId);
    console.log('Subscription details:', {
      id: subscription.id,
      status: subscription.status,
      customer: paymentIntent.customer
    });
    
    const currentPeriodEnd = subscription.current_period_end 
      ? new Date(subscription.current_period_end * 1000).toISOString() 
      : null;
    
    const { error: updErr } = await supabase
      .from('user_profiles')
      .update({
        premium: {
          isActive: true,
          type: planId,
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: paymentIntent.customer,
          status: subscription.status,
          currentPeriodEnd: currentPeriodEnd,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updErr) {
      console.error('Error updating user premium status:', updErr);
      console.error('Full error:', JSON.stringify(updErr));
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
