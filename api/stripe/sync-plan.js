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
    const { planId } = req.body;
    
    if (!planId) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: 'planId required' }));
      return;
    }

    // Get plan from Supabase
    const { data: plan, error: getErr } = await supabase
      .from('premium_plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (getErr || !plan) {
      res.writeHead(404, corsHeaders);
      res.end(JSON.stringify({ error: 'Plan not found' }));
      return;
    }

    // Create or update product with de-duplication by metadata.planId
    let product = null;
    if (plan.stripe_product_id) {
      try {
        product = await stripe.products.retrieve(plan.stripe_product_id);
      } catch (error) {
        console.log('Product not found by ID, will search by metadata');
      }
    }
    
    if (!product) {
      try {
        const search = await stripe.products.search({ 
          query: `metadata['planId']:'${plan.id}'` 
        });
        if (search.data && search.data.length > 0) {
          product = search.data[0];
        }
      } catch (error) {
        console.log('Product search failed, will create new product');
      }
    }

    if (product) {
      product = await stripe.products.update(
        product.id,
        {
          name: plan.name,
          description: plan.description || undefined,
          metadata: { 
            planId: plan.id, 
            planType: plan.plan_type || 'subscription' 
          },
        },
        { 
          idempotencyKey: `plan-product-update-${plan.id}-${Number(plan.updated_at || Date.now())}` 
        }
      );
    } else {
      product = await stripe.products.create(
        {
          name: plan.name,
          description: plan.description || undefined,
          metadata: { 
            planId: plan.id, 
            planType: plan.plan_type || 'subscription' 
          },
        },
        { 
          idempotencyKey: `plan-product-create-${plan.id}` 
        }
      );
    }

    // Deactivate old price if exists
    if (plan.stripe_price_id) {
      try { 
        await stripe.prices.update(plan.stripe_price_id, { active: false }); 
      } catch (error) {
        console.log('Failed to deactivate old price:', error.message);
      }
    }

    // Create or reuse price
    const intervalMap = { 
      monthly: 'month', 
      yearly: 'year', 
      weekly: 'week' 
    };
    const desiredInterval = (plan.plan_type || 'subscription') === 'subscription' 
      ? (intervalMap[plan.interval] || 'month') 
      : undefined;
    const unitAmount = Math.round(Number(plan.price || 0) * 100);
    const currency = (plan.currency || 'USD').toLowerCase();
    
    const activePrices = await stripe.prices.list({ 
      product: product.id, 
      active: true, 
      limit: 100 
    });
    
    let price = activePrices.data.find(p => 
      p.unit_amount === unitAmount && 
      p.currency === currency && 
      ((desiredInterval && p.recurring?.interval === desiredInterval) || 
       (!desiredInterval && !p.recurring))
    );
    
    if (!price) {
      price = await stripe.prices.create(
        {
          product: product.id,
          unit_amount: unitAmount,
          currency,
          recurring: desiredInterval ? { interval: desiredInterval } : undefined,
          metadata: { planId: plan.id },
        },
        { 
          idempotencyKey: `plan-price-${plan.id}-${unitAmount}-${currency}-${desiredInterval || 'one-time'}` 
        }
      );
    }

    // Update plan in Supabase with Stripe IDs
    const { error: updateErr } = await supabase
      .from('premium_plans')
      .update({
        stripe_product_id: product.id,
        stripe_price_id: price.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', plan.id);

    if (updateErr) {
      console.error('Failed to update plan in Supabase:', updateErr);
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ 
        error: 'Failed to update plan in database',
        details: updateErr.message 
      }));
      return;
    }

    // Return success response
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({
      success: true,
      plan: {
        id: plan.id,
        name: plan.name,
        stripe_product_id: product.id,
        stripe_price_id: price.id
      },
      message: 'Plan synchronized successfully'
    }));

  } catch (error) {
    console.error('Sync plan error:', error);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }));
  }
};
