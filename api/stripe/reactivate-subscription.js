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

    console.log(`Reactivating subscription ${subscriptionId} for user ${userId}`);

    // Reactivate the subscription in Stripe (remove cancel_at_period_end)
    const subscription = await stripe.subscriptions.update(
      subscriptionId,
      {
        cancel_at_period_end: false,
        metadata: {
          reactivated_by: userId,
          reactivated_at: new Date().toISOString()
        }
      }
    );

    console.log('Subscription reactivated in Stripe:', subscription.id);
    console.log('Cancel at period end:', subscription.cancel_at_period_end);
    console.log('Status:', subscription.status);

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
        message: 'Subscription reactivated in Stripe but failed to update local database'
      }));
      return;
    }

    // Update the premium object with reactivation info
    const updatedPremium = {
      ...profile.premium,
      status: subscription.status, // Use actual Stripe status
      cancelAtPeriodEnd: false,
      // Only update billing dates if they don't already exist or are invalid
      // This prevents overwriting correct billing dates with potentially incorrect ones
      currentPeriodEnd: profile.premium?.currentPeriodEnd || new Date(subscription.current_period_end * 1000).toISOString(),
      currentPeriodStart: profile.premium?.currentPeriodStart || new Date(subscription.current_period_start * 1000).toISOString(),
      reactivatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Remove canceledAt field if it exists
    delete updatedPremium.canceledAt;

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
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
      },
      message: 'Subscription has been reactivated successfully. You will continue to be billed.'
    }));

  } catch (error) {
    console.error('Reactivate subscription error:', error);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ 
      error: 'Failed to reactivate subscription',
      details: error.message 
    }));
  }
};

