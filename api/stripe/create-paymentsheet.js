const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// Initialize Stripe and Supabase clients
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { 
  apiVersion: '2024-06-20' 
});

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// CORS headers for cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

module.exports = async (req, res) => {
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
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
    // Parse request body
    const { userId, email, planId, productId, platform } = req.body || {};
    
    if (!userId || !email || !planId) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ 
        error: 'Missing required fields: userId, email, planId' 
      }));
      return;
    }

    // Find or create customer
    let { data: userRow, error: userErr } = await supabase
      .from('user_profiles')
      .select('id, stripe_customer_id, email, premium')
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
            email: email,
            stripe_customer_id: customerId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
      }
    } catch (dbError) {
      console.error('Error updating user profile:', dbError);
      // Continue with payment sheet creation
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 2000, // $20.00 in cents - adjust based on your plan pricing
      currency: 'usd',
      customer: customerId,
      metadata: { 
        userId, 
        planId,
        productId,
        platform 
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // Return payment sheet configuration
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({
      success: true,
      clientSecret: paymentIntent.client_secret,
      customerId: customerId,
      paymentIntentId: paymentIntent.id
    }));

  } catch (error) {
    console.error('Create payment sheet error:', error);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ 
      error: 'Failed to create payment sheet',
      details: error.message 
    }));
  }
};
