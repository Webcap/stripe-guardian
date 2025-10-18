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
    const { userId, subscriptionId } = req.body;
    
    if (!userId || !subscriptionId) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: 'userId and subscriptionId required' }));
      return;
    }

    console.log(`Canceling subscription ${subscriptionId} for user ${userId}`);

    // Cancel the subscription in Stripe (at period end, so user keeps access until then)
    const subscription = await stripe.subscriptions.update(
      subscriptionId,
      {
        cancel_at_period_end: true,
        metadata: {
          canceled_by: userId,
          canceled_at: new Date().toISOString()
        }
      }
    );

    console.log('Subscription canceled in Stripe:', subscription.id);
    console.log('Cancel at period end:', subscription.cancel_at_period_end);
    console.log('Current period end:', new Date(subscription.current_period_end * 1000).toISOString());

    // Update user profile in Supabase
    const { data: profile, error: getError } = await supabase
      .from('user_profiles')
      .select('premium')
      .eq('id', userId)
      .single();

    if (getError || !profile) {
      console.error('Error fetching user profile:', getError);
      // Still return success since Stripe was updated
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({
        success: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          cancel_at_period_end: subscription.cancel_at_period_end,
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
        },
        message: 'Subscription canceled in Stripe but failed to update local database'
      }));
      return;
    }

    // Update the premium object with cancellation info
    // Note: When canceled at period end, Stripe keeps status as 'active' until period ends
    const updatedPremium = {
      ...profile.premium,
      status: subscription.status, // Keep the actual Stripe status (usually 'active')
      cancelAtPeriodEnd: true,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : new Date().toISOString(),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
      currentPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
      updatedAt: new Date().toISOString()
    };

    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        premium: updatedPremium,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating user profile:', updateError);
      // Still return success since Stripe was updated
    }

    // Return success response
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        cancel_at_period_end: subscription.cancel_at_period_end,
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null
      },
      message: 'Subscription will be canceled at the end of the current billing period. You will not be charged again.'
    }));

  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ 
      error: 'Failed to cancel subscription',
      details: error.message 
    }));
  }
};

