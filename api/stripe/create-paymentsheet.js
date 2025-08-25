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
  console.log('Create PaymentSheet handler called');
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

    // Parse request body
    const { userId, email, planId, stripePriceId, productId, platform } = req.body || {};
    
    if (!userId || !email || !planId) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ 
        error: 'Missing required fields: userId, email, planId' 
      }));
      return;
    }

    // Validate stripePriceId if provided
    if (!stripePriceId) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ 
        error: 'Missing stripePriceId - required for correct pricing' 
      }));
      return;
    }

    // Find or create customer
    let { data: userRow, error: userErr } = await supabase
      .from('user_profiles')
      .select('id, stripe_customer_id, premium')
      .eq('id', userId)
      .single();

    if (userErr && userErr.code !== 'PGRST116') {
      console.error('Error checking existing user:', userErr);
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ 
        error: 'Database error while checking user' 
      }));
      return;
    }

    // Prevent double subscriptions
    if (userRow && userRow.premium && userRow.premium.isActive) {
      res.writeHead(409, corsHeaders);
      res.end(JSON.stringify({ 
        error: 'Subscription already active',
        message: 'You already have an active premium subscription.'
      }));
      return;
    }

    let customerId = userRow?.stripe_customer_id;

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      try {
        const customer = await stripe.customers.create({ 
          email, 
          metadata: { userId } 
        });
        customerId = customer.id;
        console.log(`Created new Stripe customer ${customerId} for user ${userId}`);
      } catch (stripeError) {
        console.error('Error creating Stripe customer:', stripeError);
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ 
          error: 'Failed to create Stripe customer',
          details: stripeError.message 
        }));
        return;
      }
    }

    // Update user profile with customer ID
    try {
      if (userRow) {
        await supabase
          .from('user_profiles')
          .update({ 
            stripe_customer_id: customerId,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId);
      } else {
        await supabase
          .from('user_profiles')
          .insert({ 
            id: userId,
            stripe_customer_id: customerId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
      }
    } catch (dbError) {
      console.error('Error updating user profile:', dbError);
      // Continue with payment sheet creation
    }

    // Get plan details and validate Stripe price
    let planPrice, planCurrency;
    try {
      // Retrieve the Stripe price to get the correct amount
      const stripePrice = await stripe.prices.retrieve(stripePriceId);
      planPrice = stripePrice.unit_amount;
      planCurrency = stripePrice.currency;
      
      console.log(`Retrieved Stripe price: ${stripePrice.id}, amount: ${planPrice} cents, currency: ${planCurrency}`);
      
      // Validate the price exists and is active
      if (!stripePrice.active) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ 
          error: 'Selected plan price is not active' 
        }));
        return;
      }
    } catch (priceError) {
      console.error('Error retrieving Stripe price:', priceError);
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ 
        error: 'Invalid plan price ID',
        details: 'The selected plan price could not be found'
      }));
      return;
    }

    // Create payment intent using the correct price from Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: planPrice, // Use the actual price from Stripe, not hardcoded amount
      currency: planCurrency,
      customer: customerId,
      metadata: { 
        userId, 
        planId,
        stripePriceId, // Store the price ID for reference
        productId,
        platform 
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    console.log(`Created payment intent ${paymentIntent.id} for customer ${customerId} with amount ${planPrice} cents (${(planPrice / 100).toFixed(2)} ${planCurrency.toUpperCase()})`);

    // Create ephemeral key for the customer
    let ephemeralKey;
    try {
      ephemeralKey = await stripe.ephemeralKeys.create(
        { customer: customerId },
        { apiVersion: '2024-06-20' }
      );
      console.log(`Created ephemeral key for customer ${customerId}`);
    } catch (ephemeralKeyError) {
      console.error('Error creating ephemeral key:', ephemeralKeyError);
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ 
        error: 'Failed to create ephemeral key',
        details: ephemeralKeyError.message 
      }));
      return;
    }

    // Prepare response data
    const responseData = {
      success: true,
      paymentIntent: paymentIntent.client_secret, // Client expects 'paymentIntent' not 'clientSecret'
      paymentIntentId: paymentIntent.id,
      ephemeralKey: ephemeralKey.secret,
      customer: customerId, // Client expects 'customer' not 'customerId'
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
    };

    console.log('PaymentSheet API response data:', responseData);

    // Return payment sheet configuration
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify(responseData));

  } catch (error) {
    console.error('Create payment sheet error:', error);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ 
      error: 'Failed to create payment sheet',
      details: error.message 
    }));
  }
};

module.exports = handler;
