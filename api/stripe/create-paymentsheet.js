const Stripe = require('stripe');
const { wiznoteAdmin } = require('../../server/lib/supabase-admin');
const { getCorsHeaders } = require('../../server/lib/cors');

// Initialize Stripe client
let stripe;

try {
  console.log('Environment variables check:');
  console.log('STRIPE_SECRET_KEY exists:', !!process.env.STRIPE_SECRET_KEY);
  console.log('WIZNOTE_SUPABASE_URL exists:', !!process.env.WIZNOTE_SUPABASE_URL);
  console.log('WIZNOTE_SUPABASE_SECRET_KEY exists:', !!process.env.WIZNOTE_SUPABASE_SECRET_KEY);
  console.log('WIZNOTE_SUPABASE_SERVICE_KEY exists:', !!process.env.WIZNOTE_SUPABASE_SERVICE_KEY);
  
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { 
    apiVersion: '2024-06-20' 
  });
  console.log('Stripe client initialized successfully');
  console.log('Wiznote Supabase client initialized from supabase-admin module');
} catch (initError) {
  console.error('Error initializing clients:', initError);
  // We'll handle this in the main function
}

// Use wiznoteAdmin as supabase client for accessing user_profiles
const supabase = wiznoteAdmin;

const handler = async (req, res) => {
  const corsHeaders = getCorsHeaders(req);
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
    // Check if Stripe is properly initialized
    if (!stripe) {
      console.error('Stripe client not initialized properly');
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ 
        error: 'Service not properly initialized',
        details: 'Payment service is temporarily unavailable'
      }));
      return;
    }

    // Parse request body
    const { 
      userId, 
      email, 
      planId, 
      stripePriceId, 
      productId, 
      platform,
      couponId = null,  // Optional: Stripe coupon ID for promotions
      promotionId = null  // Optional: Internal promotion ID for tracking
    } = req.body || {};
    
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

    // Validate stored customer exists in Stripe (handles test/live mismatch or deleted customers)
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch (stripeErr) {
        const isNoSuchCustomer = stripeErr.code === 'resource_missing' ||
          (stripeErr.message && stripeErr.message.includes('No such customer'));
        if (isNoSuchCustomer) {
          console.log(`Stored customer ${customerId} not found in Stripe, creating new customer`);
          customerId = null;
          await supabase
            .from('user_profiles')
            .update({ stripe_customer_id: null, updated_at: new Date().toISOString() })
            .eq('id', userId);
        } else {
          throw stripeErr;
        }
      }
    }

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

    // For subscriptions, use SetupIntent instead of PaymentIntent
    // This collects payment method without charging immediately
    // The subscription creation will handle the first charge
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      metadata: { 
        userId, 
        planId,
        stripePriceId,
        productId,
        platform,
        couponId: couponId || '',  // Pass coupon for later subscription creation
        promotionId: promotionId || ''  // Pass promotion ID for tracking
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    console.log(`Created setup intent ${setupIntent.id} for customer ${customerId} (subscription will be created after payment method is saved)`);

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

    // Prepare response data for SetupIntent
    const responseData = {
      success: true,
      setupIntent: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
      ephemeralKey: ephemeralKey.secret,
      customer: customerId,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
      // Include plan info so confirm endpoint knows what to subscribe to
      planId: planId,
      stripePriceId: stripePriceId
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
