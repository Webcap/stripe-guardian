const Stripe = require('stripe');
const { wiznoteAdmin } = require('../../server/lib/supabase-admin');
const { getCorsHeaders } = require('../../server/lib/cors');

// Initialize Stripe client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { 
  apiVersion: '2024-06-20' 
});

// Use wiznoteAdmin as supabase client for accessing user_profiles
const supabase = wiznoteAdmin;

module.exports = async (req, res) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    res.end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    res.writeHead(405, corsHeaders);
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  try {
    // Parse query parameters from URL
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('session_id');
    
    if (!sessionId) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: 'Missing session_id parameter' }));
      return;
    }
    
    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer']
    });
    
    if (!session || session.payment_status !== 'paid') {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ 
        error: 'Session not found or payment not completed' 
      }));
      return;
    }
    
    const subscription = session.subscription;
    const customer = session.customer;
    
    if (!subscription || !customer) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ 
        error: 'Subscription or customer not found' 
      }));
      return;
    }
    
    // Get planId from metadata
    let planId = session.metadata?.planId || subscription.metadata?.planId;
    if (!planId) {
      try {
        const items = Array.isArray(subscription.items?.data) ? subscription.items.data : [];
        const firstPrice = items[0]?.price;
        planId = firstPrice?.metadata?.planId || null;
      } catch (error) {
        console.log('Failed to extract plan ID from subscription items:', error.message);
      }
    }
    
    if (!planId) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ 
        error: 'Plan ID not found in session metadata' 
      }));
      return;
    }
    
    // Update user premium status immediately
    const { data: userRow, error: findErr } = await supabase
      .from('user_profiles')
      .select('id, stripe_customer_id')
      .eq('stripe_customer_id', customer.id)
      .single();

    if (findErr || !userRow) {
      res.writeHead(404, corsHeaders);
      res.end(JSON.stringify({ 
        error: 'User not found for this customer' 
      }));
      return;
    }

    // Update the user's premium status
    const { error: updateErr } = await supabase
      .from('user_profiles')
      .update({
        premium: {
          isActive: true,
          type: planId,
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: customer.id,
          status: subscription.status,
          currentPeriodEnd: subscription.current_period_end ? 
            new Date(subscription.current_period_end * 1000).toISOString() : null,
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', userRow.id);

    if (updateErr) {
      console.error('Error updating user premium status:', updateErr);
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ 
        error: 'Failed to update premium status',
        details: updateErr.message 
      }));
      return;
    }

    console.log(`Successfully verified session ${sessionId} for user ${userRow.id}, plan ${planId}`);
    
    // Return success response
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({
      success: true,
      session: {
        id: session.id,
        payment_status: session.payment_status,
        subscription_id: subscription.id,
        customer_id: customer.id,
        plan_id: planId
      },
      message: 'Session verified successfully'
    }));

  } catch (error) {
    console.error('Verify session error:', error);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }));
  }
};
