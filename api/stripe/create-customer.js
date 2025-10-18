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
    const { userId, email, name, phone, metadata = {} } = req.body || {};
    
    if (!userId || !email) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ 
        error: 'Missing required fields: userId, email' 
      }));
      return;
    }

    // Check if user already exists in Supabase
    let { data: userRow, error: userErr } = await supabase
      .from('user_profiles')
      .select('id, stripe_customer_id')
      .eq('id', userId)
      .single();

    if (userErr && userErr.code !== 'PGRST116') {
      // PGRST116 is "not found" error, which is expected for new users
      console.error('Error checking existing user:', userErr);
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ 
        error: 'Database error while checking user',
        details: userErr.message
      }));
      return;
    }

    // If user already has a Stripe customer ID, return it
    if (userRow && userRow.stripe_customer_id) {
      console.log(`User ${userId} already has Stripe customer ID: ${userRow.stripe_customer_id}`);
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({
        success: true,
        customerId: userRow.stripe_customer_id,
        message: 'Customer already exists',
        isExisting: true
      }));
      return;
    }

    // Check if a Stripe customer already exists with this email
    let customerId = null;
    try {
      const existingCustomers = await stripe.customers.list({ 
        email: email, 
        limit: 1 
      });
      
      if (existingCustomers.data && existingCustomers.data.length > 0) {
        // Use existing customer
        customerId = existingCustomers.data[0].id;
        console.log(`Found existing Stripe customer ${customerId} for email ${email}`);
      }
    } catch (stripeError) {
      console.error('Error checking existing Stripe customers:', stripeError);
      // Continue to create new customer
    }

    // Create new Stripe customer if none exists
    if (!customerId) {
      try {
        const customerData = {
          email,
          metadata: { 
            userId,
            ...metadata 
          }
        };

        // Add optional fields if provided
        if (name) customerData.name = name;
        if (phone) customerData.phone = phone;

        const customer = await stripe.customers.create(customerData);
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

    // Update or create user profile in Supabase
    try {
      if (userRow) {
        // Update existing user - only update stripe_customer_id, don't add email column
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({ 
            stripe_customer_id: customerId,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId);
        
        if (updateError) {
          console.error('Error updating user profile:', updateError);
          throw updateError;
        }
        
        console.log(`Updated user ${userId} with Stripe customer ID ${customerId}`);
      } else {
        // Create new user profile - only include fields that exist in the table
        const { error: insertError } = await supabase
          .from('user_profiles')
          .insert({ 
            id: userId,
            stripe_customer_id: customerId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        
        if (insertError) {
          console.error('Error creating user profile:', insertError);
          throw insertError;
        }
        
        console.log(`Created user profile for ${userId} with Stripe customer ID ${customerId}`);
      }
    } catch (dbError) {
      console.error('Error updating user profile:', dbError);
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ 
        error: 'Failed to update user profile in database',
        details: dbError.message 
      }));
      return;
    }

    // Return success response
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({
      success: true,
      customerId: customerId,
      message: 'Customer created successfully',
      isExisting: false
    }));

  } catch (error) {
    console.error('Create customer error:', error);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }));
  }
};
