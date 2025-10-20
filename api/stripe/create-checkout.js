const Stripe = require('stripe');
const { wiznoteAdmin } = require('../../server/lib/supabase-admin');

// Initialize Stripe client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { 
  apiVersion: '2024-06-20' 
});

// Use wiznoteAdmin as supabase client for accessing user_profiles
const supabase = wiznoteAdmin;

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
    const { 
      userId, 
      email, 
      planId, 
      priceId, 
      successUrl = '', 
      cancelUrl = '',
      couponId = null,  // Optional: Stripe coupon ID for promotions
      promotionId = null  // Optional: Internal promotion ID for tracking
    } = req.body || {};
    
    if (!userId || !email || !planId || !priceId) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ 
        error: 'Missing required fields: userId, email, planId, priceId' 
      }));
      return;
    }

    // Find or create customer by storing id on user_profiles
    let { data: userRow, error: userErr } = await supabase
      .from('user_profiles')
      .select('id, stripe_customer_id, premium')
      .eq('id', userId)
      .single();

    if (userErr || !userRow) {
      // Attempt to create a minimal user row for development convenience
      try {
        const now = new Date().toISOString();
        const ins = await supabase
          .from('user_profiles')
          .insert({ 
            id: userId, 
            created_at: now, 
            updated_at: now 
          })
          .select('id, stripe_customer_id, premium')
          .single();
        userRow = ins.data || null;
      } catch (e) {
        res.writeHead(404, corsHeaders);
        res.end(JSON.stringify({ error: 'User not found' }));
        return;
      }
    }

    // Prevent double subscriptions - check if user already has an active or pending subscription
    if (userRow && userRow.premium) {
      const premium = userRow.premium;
      
      // Check if user already has an active subscription
      if (premium.isActive && premium.stripeSubscriptionId) {
        console.log(`User ${userId} already has active subscription ${premium.stripeSubscriptionId}, preventing double subscription`);
        res.writeHead(409, corsHeaders);
        res.end(JSON.stringify({ 
          error: 'Subscription already active',
          message: 'You already have an active premium subscription. Please wait for it to activate or contact support if you need help.',
          existingSubscriptionId: premium.stripeSubscriptionId,
          planType: premium.type
        }));
        return;
      }
      
      // Check if user has a pending subscription
      if (premium.stripeSubscriptionId && premium.status && 
          ['incomplete', 'incomplete_expired', 'past_due', 'unpaid'].includes(premium.status)) {
        console.log(`User ${userId} has pending subscription ${premium.stripeSubscriptionId} with status ${premium.status}, preventing double subscription`);
        res.writeHead(409, corsHeaders);
        res.end(JSON.stringify({ 
          error: 'Subscription pending',
          message: 'You have a subscription that is currently being processed. Please wait for it to activate or contact support if you need help.',
          existingSubscriptionId: premium.stripeSubscriptionId,
          status: premium.status,
          planType: premium.type
        }));
        return;
      }
    }
    
    let customerId = (userRow && userRow.stripe_customer_id) ? userRow.stripe_customer_id : null;
    
    if (!customerId) {
      // Check if a Stripe customer already exists with this email
      try {
        const existingCustomers = await stripe.customers.list({ email: email, limit: 1 });
        if (existingCustomers.data && existingCustomers.data.length > 0) {
          // Use existing customer
          customerId = existingCustomers.data[0].id;
          console.log(`Found existing Stripe customer ${customerId} for email ${email}`);
        } else {
          // Create new customer
          const customer = await stripe.customers.create({ 
            email, 
            metadata: { userId } 
          });
          customerId = customer.id;
          console.log(`Created new Stripe customer ${customerId} for email ${email}`);
        }
      } catch (stripeError) {
        console.error('Error checking/creating Stripe customer:', stripeError);
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ error: 'Failed to create or find Stripe customer' }));
        return;
      }
    }

    // Additional check: Look for existing Stripe subscriptions for this customer
    if (customerId) {
      try {
        const existingSubscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: 'all',
          limit: 10
        });

        // Check for active or pending subscriptions
        const activeSubscriptions = existingSubscriptions.data.filter(sub => 
          ['active', 'trialing', 'incomplete', 'past_due', 'unpaid'].includes(sub.status)
        );

        if (activeSubscriptions.length > 0) {
          const mostRecent = activeSubscriptions[0]; // Stripe returns most recent first
          console.log(`User ${userId} has existing Stripe subscription ${mostRecent.id} with status ${mostRecent.status}, preventing double subscription`);
          
          // Update the user profile with the existing subscription info
          try {
            await supabase
              .from('user_profiles')
              .update({
                premium: {
                  isActive: ['active', 'trialing'].includes(mostRecent.status),
                  type: mostRecent.metadata?.planId || 'unknown',
                  stripeSubscriptionId: mostRecent.id,
                  stripeCustomerId: customerId,
                  status: mostRecent.status,
                  currentPeriodEnd: mostRecent.current_period_end ? new Date(mostRecent.current_period_end * 1000).toISOString() : null,
                },
                updated_at: new Date().toISOString()
              })
              .eq('id', userId);
            console.log(`Updated user ${userId} with existing subscription ${mostRecent.id}`);
          } catch (updateError) {
            console.error('Failed to update user with existing subscription:', updateError);
          }

          res.writeHead(409, corsHeaders);
          res.end(JSON.stringify({ 
            error: 'Existing subscription found',
            message: 'We found an existing subscription for your account. Please wait for it to activate or contact support if you need help.',
            existingSubscriptionId: mostRecent.id,
            status: mostRecent.status,
            planId: mostRecent.metadata?.planId
          }));
          return;
        }
      } catch (stripeError) {
        console.error('Error checking existing Stripe subscriptions:', stripeError);
        // Don't fail the request, just log the error
      }
    }
      
    // Update the user profile with the customer ID
    try {
      if (userRow) {
        await supabase
          .from('user_profiles')
          .update({ 
            stripe_customer_id: customerId, 
            updated_at: new Date().toISOString() 
          })
          .eq('id', userId);
        console.log(`Updated user ${userId} with Stripe customer ID ${customerId}`);
      } else {
        await supabase
          .from('user_profiles')
          .insert({ 
            id: userId, 
            email: email || null, 
            stripe_customer_id: customerId, 
            created_at: new Date().toISOString(), 
            updated_at: new Date().toISOString() 
          });
        console.log(`Created user profile for ${userId} with Stripe customer ID ${customerId}`);
      }
    } catch (dbError) {
      console.error('Error updating user profile with Stripe customer ID:', dbError);
      // Don't fail the request - the customer was created in Stripe
    }

    // Create Stripe checkout session
    const sessionParams = {
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      subscription_data: { 
        metadata: { 
          planId,
          promotionId: promotionId || undefined
        } 
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { 
        planId,
        promotionId: promotionId || undefined
      },
    };
    
    // Apply coupon if provided
    if (couponId) {
      console.log(`Applying coupon ${couponId} to checkout session`);
      sessionParams.discounts = [{ coupon: couponId }];
      
      // Optionally allow user to enter promotion codes at checkout
      // sessionParams.allow_promotion_codes = true;
    } else {
      // Allow users to enter promotion codes if no coupon is pre-applied
      sessionParams.allow_promotion_codes = true;
    }
    
    const session = await stripe.checkout.sessions.create(sessionParams);

    // Return success response with checkout URL
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({ 
      url: session.url || '',
      sessionId: session.id,
      customerId: customerId
    }));

  } catch (error) {
    console.error('Create checkout error:', error);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ 
      error: 'Failed to create checkout session',
      details: error.message 
    }));
  }
};
