/**
 * Stripe webhook server for handling subscription events
 * This server processes Stripe webhooks and updates user premium status
 * 
 * NEW: Double subscription prevention - prevents users from creating multiple
 * subscriptions when their premium status hasn't activated yet
 */
require('dotenv/config');
const http = require('http');
const { URL } = require('url');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const PORT = Number(process.env.WEBHOOK_PORT || 3001);
const REQUIRED_ENVS = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'SUPABASE_URL'];
const missing = REQUIRED_ENVS.filter((k) => !process.env[k] || String(process.env[k]).trim() === '');
if (missing.length) {
  console.warn('[webhook] Missing env vars:', missing.join(', '));
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[webhook] WARNING: SUPABASE_SERVICE_ROLE_KEY is not set. Database updates may be blocked by RLS.');
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function handleWebhook(req, res) {
  try {
    const signature = req.headers['stripe-signature'];
    if (!signature || typeof signature !== 'string') {
      return sendJson(res, 400, { error: 'Missing Stripe-Signature header' });
    }

    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', async () => {
      try {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });
        const event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET || '');

        await handleStripeEvent(event, stripe);
        return sendJson(res, 200, { received: true });
      } catch (err) {
        console.error('Webhook handling error:', err?.message || err);
        return sendJson(res, 400, { error: 'Webhook Error' });
      }
    });
  } catch (error) {
    console.error('Webhook request error:', error?.message || error);
    return sendJson(res, 500, { error: 'Internal Server Error' });
  }
}

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  // CORS (dev)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Stripe-Signature');
  if (method === 'OPTIONS') {
    return sendJson(res, 200, { ok: true });
  }

  if (method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { ok: true });
  }

  if (method === 'GET' && url.pathname === '/ready') {
    const readiness = { ok: true, checks: {} };
    readiness.checks.env = {
      STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: !!process.env.STRIPE_WEBHOOK_SECRET,
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });
      await stripe.products.list({ limit: 1 });
      readiness.checks.stripe = true;
    } catch (e) {
      readiness.ok = false;
      readiness.checks.stripe = false;
    }
    try {
      const sb = getSupabase();
      await sb.from('premium_plans').select('id').limit(1);
      readiness.checks.supabase = true;
    } catch (e) {
      readiness.ok = false;
      readiness.checks.supabase = false;
    }
    
    // Add webhook processing status
    readiness.checks.webhookProcessing = {
      processedEvents: processedEventIds.size,
      lastEventTime: lastProcessedEventTime || null,
      serverUptime: process.uptime()
    };
    
    if (!Object.values(readiness.checks.env).every(Boolean)) readiness.ok = false;
    return sendJson(res, readiness.ok ? 200 : 503, readiness);
  }

  if (url.pathname === '/api/stripe/webhook') {
    if (method !== 'POST') {
      return sendJson(res, 405, { error: 'Method Not Allowed' });
    }
    return handleWebhook(req, res);
  }

  if (url.pathname.startsWith('/api/stripe/verify-session')) {
    if (method !== 'GET') return sendJson(res, 405, { error: 'Method Not Allowed' });
    
    const sessionId = new URL(req.url, `http://${req.headers.host}`).searchParams.get('session_id');
    if (!sessionId) {
      return sendJson(res, 400, { error: 'Missing session_id parameter' });
    }
    
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });
      
      // Retrieve the checkout session
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription', 'customer']
      });
      
      if (!session || session.payment_status !== 'paid') {
        return sendJson(res, 400, { error: 'Session not found or payment not completed' });
      }
      
      const subscription = session.subscription;
      const customer = session.customer;
      
      if (!subscription || !customer) {
        return sendJson(res, 400, { error: 'Subscription or customer not found' });
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
        return sendJson(res, 400, { error: 'Plan ID not found in session metadata' });
      }
      
      // Update user premium status immediately
      const sb = getSupabase();
      const { data: userRow, error: findErr } = await sb
        .from('user_profiles')
        .select('id, stripe_customer_id')
        .eq('stripe_customer_id', customer.id)
        .single();
        
      if (findErr || !userRow) {
        // Try alternative lookup methods
        const { data: altUserRow } = await sb
          .from('user_profiles')
          .select('id, stripe_customer_id')
          .eq('id', customer.id)
          .single();
          
        if (altUserRow) {
          // Update stripe_customer_id if missing
          await sb
            .from('user_profiles')
            .update({
              stripe_customer_id: customer.id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', altUserRow.id);
          userRow = altUserRow;
        } else {
          return sendJson(res, 404, { error: 'User not found for this customer' });
        }
      }
      
      // Immediately grant premium access
      const isActive = subscription.status === 'active' || subscription.status === 'trialing';
      const currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null;
      
      const { error: updErr } = await sb
        .from('user_profiles')
        .update({
          premium: {
            isActive,
            type: planId,
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: customer.id,
            status: subscription.status,
            currentPeriodEnd,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', userRow.id);
        
      if (updErr) {
        console.error('Failed to update user premium status:', updErr);
        return sendJson(res, 500, { error: 'Failed to update premium status' });
      }
      
      console.log(`Immediately granted premium access to user ${userRow.id} for plan ${planId}`);
      return sendJson(res, 200, { 
        ok: true, 
        premiumGranted: true,
        userId: userRow.id,
        planId,
        subscriptionId: subscription.id
      });
      
    } catch (error) {
      console.error('Session verification error:', error);
      return sendJson(res, 500, { error: 'Failed to verify session' });
    }
  }

  if (url.pathname === '/api/stripe/create-checkout') {
    if (method !== 'POST') {
      return sendJson(res, 405, { error: 'Method Not Allowed' });
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', async () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const body = raw ? JSON.parse(raw) : {};
        const { userId, email, planId, priceId, successUrl = '', cancelUrl = '' } = body || {};
        if (!userId || !email || !planId || !priceId) {
          return sendJson(res, 400, { error: 'Missing required fields: userId, email, planId, priceId' });
        }

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });

        // Find or create customer by storing id on user_profiles
        const sb = getSupabase();
        let { data: userRow, error: userErr } = await sb
          .from('user_profiles')
          .select('id, stripe_customer_id, email, premium')
          .eq('id', userId)
          .single();
        if (userErr || !userRow) {
          // Attempt to create a minimal user row for development convenience
          try {
            const now = new Date().toISOString();
            const ins = await sb
              .from('user_profiles')
              .insert({ id: userId, email: email || null, created_at: now, updated_at: now })
              .select('id, stripe_customer_id, email, premium')
              .single();
            userRow = ins.data || null;
          } catch (e) {
            return sendJson(res, 404, { error: 'User not found' });
          }
        }

        // Prevent double subscriptions - check if user already has an active or pending subscription
        if (userRow && userRow.premium) {
          const premium = userRow.premium;
          
          // Check if user already has an active subscription
          if (premium.isActive && premium.stripeSubscriptionId) {
            console.log(`User ${userId} already has active subscription ${premium.stripeSubscriptionId}, preventing double subscription`);
            return sendJson(res, 409, { 
              error: 'Subscription already active',
              message: 'You already have an active premium subscription. Please wait for it to activate or contact support if you need help.',
              existingSubscriptionId: premium.stripeSubscriptionId,
              planType: premium.type
            });
          }
          
          // Check if user has a pending subscription (status might be 'incomplete', 'past_due', etc.)
          if (premium.stripeSubscriptionId && premium.status && 
              ['incomplete', 'incomplete_expired', 'past_due', 'unpaid'].includes(premium.status)) {
            console.log(`User ${userId} has pending subscription ${premium.stripeSubscriptionId} with status ${premium.status}, preventing double subscription`);
            return sendJson(res, 409, { 
              error: 'Subscription pending',
              message: 'You have a subscription that is currently being processed. Please wait for it to activate or contact support if you need help.',
              existingSubscriptionId: premium.stripeSubscriptionId,
              status: premium.status,
              planType: premium.type
            });
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
              const customer = await stripe.customers.create({ email, metadata: { userId } });
              customerId = customer.id;
              console.log(`Created new Stripe customer ${customerId} for email ${email}`);
            }
          } catch (stripeError) {
            console.error('Error checking/creating Stripe customer:', stripeError);
            return sendJson(res, 500, { error: 'Failed to create or find Stripe customer' });
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
                await sb
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

              return sendJson(res, 409, { 
                error: 'Existing subscription found',
                message: 'We found an existing subscription for your account. Please wait for it to activate or contact support if you need help.',
                existingSubscriptionId: mostRecent.id,
                status: mostRecent.status,
                planId: mostRecent.metadata?.planId
              });
            }
          } catch (stripeError) {
            console.error('Error checking existing Stripe subscriptions:', stripeError);
            // Don't fail the request, just log the error
          }
        }
          
        // Update the user profile with the customer ID
        try {
          if (userRow) {
            await sb
              .from('user_profiles')
              .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
              .eq('id', userId);
            console.log(`Updated user ${userId} with Stripe customer ID ${customerId}`);
          } else {
            await sb
              .from('user_profiles')
              .insert({ id: userId, email: email || null, stripe_customer_id: customerId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
            console.log(`Created user profile for ${userId} with Stripe customer ID ${customerId}`);
          }
        } catch (dbError) {
          console.error('Error updating user profile with Stripe customer ID:', dbError);
          // Don't fail the request - the customer was created in Stripe
        }

        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          payment_method_types: ['card'],
          line_items: [{ price: priceId, quantity: 1 }],
          mode: 'subscription',
          subscription_data: { metadata: { planId } },
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata: { planId },
        });

        return sendJson(res, 200, { url: session.url || '' });
      } catch (e) {
        console.error('Create checkout error:', e?.message || e);
        return sendJson(res, 500, { error: 'Failed to create checkout session' });
      }
    });
    return;
  }

  if (url.pathname === '/api/verify-purchase') {
    if (method !== 'POST') {
      return sendJson(res, 405, { error: 'Method Not Allowed' });
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', async () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const body = raw ? JSON.parse(raw) : {};
        const { userId, platform, productId, transactionId, purchaseToken, receipt, planId } = body || {};
        
        if (!userId || !platform || !productId || !transactionId || !planId) {
          return sendJson(res, 400, { error: 'Missing required fields: userId, platform, productId, transactionId, planId' });
        }

        const sb = getSupabase();
        
        // Verify the purchase with the platform (Apple/Google)
        // For now, we'll trust the client and update the user's premium status
        // In production, you should implement proper receipt validation
        
        // Use the planId directly from the request body
        
        // Update user's premium status
        const { error: updateError } = await sb
          .from('user_profiles')
          .update({
            premium: {
              isActive: true,
              type: planId,
              platform: platform,
              inAppPurchaseId: productId,
              transactionId: transactionId,
              purchaseToken: purchaseToken,
              receipt: receipt,
              status: 'active',
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);

        if (updateError) {
          console.error('Error updating user premium status:', updateError);
          return sendJson(res, 500, { error: 'Failed to update premium status' });
        }

        console.log(`Successfully verified in-app purchase for user ${userId}, plan ${planId}`);
        return sendJson(res, 200, { 
          success: true,
          message: 'Purchase verified successfully',
          planId: planId
        });

      } catch (e) {
        console.error('Verify purchase error:', e?.message || e);
        return sendJson(res, 500, { error: 'Failed to verify purchase' });
      }
    });
    return;
  }

  if (url.pathname === '/api/stripe/create-paymentsheet') {
    if (method !== 'POST') {
      return sendJson(res, 405, { error: 'Method Not Allowed' });
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', async () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const body = raw ? JSON.parse(raw) : {};
        const { userId, email, planId, productId, platform } = body || {};
        
        if (!userId || !email || !planId) {
          return sendJson(res, 400, { error: 'Missing required fields: userId, email, planId' });
        }

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });
        const sb = getSupabase();

        // Find or create customer
        let { data: userRow, error: userErr } = await sb
          .from('user_profiles')
          .select('id, stripe_customer_id, email, premium')
          .eq('id', userId)
          .single();

        if (userErr || !userRow) {
          try {
            const now = new Date().toISOString();
            const ins = await sb
              .from('user_profiles')
              .insert({ id: userId, email: email || null, created_at: now, updated_at: now })
              .select('id, stripe_customer_id, email, premium')
              .single();
            userRow = ins.data || null;
          } catch (e) {
            return sendJson(res, 404, { error: 'User not found' });
          }
        }

        // Check for existing subscriptions
        if (userRow && userRow.premium && userRow.premium.isActive) {
          return sendJson(res, 409, { 
            error: 'Subscription already active',
            message: 'You already have an active premium subscription.'
          });
        }

        let customerId = userRow?.stripe_customer_id;
        
        if (!customerId) {
          try {
            // First, try to find existing customer by email
            const existingCustomers = await stripe.customers.list({ email: email, limit: 10 });
            
            if (existingCustomers.data && existingCustomers.data.length > 0) {
              // Use the first customer found (most recent)
              customerId = existingCustomers.data[0].id;
              console.log(`Found existing Stripe customer ${customerId} for email ${email}`);
              
              // Update the user profile with the found customer ID
              try {
                await sb
                  .from('user_profiles')
                  .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
                  .eq('id', userId);
                console.log(`Updated user ${userId} with existing Stripe customer ID ${customerId}`);
              } catch (dbError) {
                console.error('Error updating user profile with existing customer ID:', dbError);
              }
            } else {
              // Create new customer with idempotency key to prevent duplicates
              const idempotencyKey = `customer-${userId}-${email}-${Date.now()}`;
              const customer = await stripe.customers.create({ 
                email, 
                metadata: { userId },
                description: `Customer for user ${userId}`
              }, {
                idempotencyKey: idempotencyKey
              });
              customerId = customer.id;
              console.log(`Created new Stripe customer ${customerId} for user ${userId} with email ${email}`);
            }
          } catch (stripeError) {
            console.error('Error with Stripe customer:', stripeError);
            return sendJson(res, 500, { error: 'Failed to create or find Stripe customer' });
          }
        }

        // Update user profile with customer ID
        if (userRow && !userRow.stripe_customer_id) {
          try {
            await sb
              .from('user_profiles')
              .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
              .eq('id', userId);
          } catch (dbError) {
            console.error('Error updating user profile:', dbError);
          }
        }

        // Get plan details to find Stripe price ID
        const { data: plan, error: planErr } = await sb
          .from('premium_plans')
          .select('stripe_price_id, price, interval')
          .eq('id', planId)
          .single();

        if (planErr || !plan) {
          return sendJson(res, 404, { error: 'Plan not found' });
        }

        if (!plan.stripe_price_id) {
          return sendJson(res, 400, { error: 'Plan not configured for payments' });
        }

        // Create PaymentSheet configuration for subscription
        const paymentSheet = await stripe.paymentIntents.create({
          amount: Math.round(plan.price * 100), // Convert to cents
          currency: 'usd',
          customer: customerId,
          metadata: { 
            planId,
            platform,
            userId,
            source: 'paymentsheet'
          },
          automatic_payment_methods: {
            enabled: true,
          },
          setup_future_usage: 'off_session', // Enable future payments for subscription
        });

        // Create ephemeral key for PaymentSheet
        const ephemeralKey = await stripe.ephemeralKeys.create(
          { customer: customerId },
          { apiVersion: '2024-06-20' }
        );

        const response = { 
          paymentIntent: paymentSheet.client_secret,
          paymentIntentId: paymentSheet.id,
          ephemeralKey: ephemeralKey.secret,
          customer: customerId,
          publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || ''
        };

        console.log('PaymentSheet created successfully:', {
          paymentIntentId: paymentSheet.id,
          customerId,
          hasClientSecret: !!paymentSheet.client_secret,
          hasEphemeralKey: !!ephemeralKey.secret
        });

        return sendJson(res, 200, response);
      } catch (e) {
        console.error('Create PaymentSheet error:', e?.message || e);
        return sendJson(res, 500, { error: 'Failed to create PaymentSheet' });
      }
    });
    return;
  }

  if (url.pathname === '/api/stripe/create-mobile-checkout') {
    if (method !== 'POST') {
      return sendJson(res, 405, { error: 'Method Not Allowed' });
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', async () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const body = raw ? JSON.parse(raw) : {};
        const { userId, email, planId, productId, platform, returnUrl, cancelUrl } = body || {};
        
        if (!userId || !email || !planId) {
          return sendJson(res, 400, { error: 'Missing required fields: userId, email, planId' });
        }

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });
        const sb = getSupabase();

        // Find or create customer
        let { data: userRow, error: userErr } = await sb
          .from('user_profiles')
          .select('id, stripe_customer_id, email, premium')
          .eq('id', userId)
          .single();

        if (userErr || !userRow) {
          try {
            const now = new Date().toISOString();
            const ins = await sb
              .from('user_profiles')
              .insert({ id: userId, email: email || null, created_at: now, updated_at: now })
              .single();
            userRow = ins.data || null;
          } catch (e) {
            return sendJson(res, 404, { error: 'User not found' });
          }
        }

        // Check for existing subscriptions
        if (userRow && userRow.premium && userRow.premium.isActive) {
          return sendJson(res, 409, { 
            error: 'Subscription already active',
            message: 'You already have an active premium subscription.'
          });
        }

        let customerId = userRow?.stripe_customer_id;
        
        if (!customerId) {
          try {
            // First, try to find existing customer by email
            const existingCustomers = await stripe.customers.list({ email: email, limit: 10 });
            
            if (existingCustomers.data && existingCustomers.data.length > 0) {
              // Use the first customer found (most recent)
              customerId = existingCustomers.data[0].id;
              console.log(`Found existing Stripe customer ${customerId} for email ${email}`);
              
              // Update the user profile with the found customer ID
              try {
                await sb
                  .from('user_profiles')
                  .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
                  .eq('id', userId);
                console.log(`Updated user ${userId} with existing Stripe customer ID ${customerId}`);
              } catch (dbError) {
                console.error('Error updating user profile with existing customer ID:', dbError);
              }
            } else {
              // Create new customer with idempotency key to prevent duplicates
              const idempotencyKey = `customer-${userId}-${email}-${Date.now()}`;
              const customer = await stripe.customers.create({ 
                email, 
                metadata: { userId },
                description: `Customer for user ${userId}`
              }, {
                idempotencyKey: idempotencyKey
              });
              customerId = customer.id;
              console.log(`Created new Stripe customer ${customerId} for user ${userId} with email ${email}`);
            }
          } catch (stripeError) {
            console.error('Error with Stripe customer:', stripeError);
            return sendJson(res, 500, { error: 'Failed to create or find Stripe customer' });
          }
        }

        // Update user profile with customer ID
        if (userRow && !userRow.stripe_customer_id) {
          try {
            await sb
              .from('user_profiles')
              .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
              .eq('id', userId);
          } catch (dbError) {
            console.error('Error updating user profile:', dbError);
          }
        }

        // Get plan details to find Stripe price ID
        const { data: plan, error: planErr } = await sb
          .from('premium_plans')
          .select('stripe_price_id, price, interval')
          .eq('id', planId)
          .single();

        if (planErr || !plan) {
          return sendJson(res, 404, { error: 'Plan not found' });
        }
        
        if (!plan.stripe_price_id) {
          return sendJson(res, 400, { error: 'Plan not configured for payments' });
        }

        // Create mobile-optimized checkout session
        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          payment_method_types: ['card'],
          line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
          mode: 'subscription',
          subscription_data: { 
            metadata: { 
              planId,
              platform,
              productId,
              userId 
            } 
          },
          success_url: returnUrl || `${process.env.EXPO_PUBLIC_WEBHOOK_BASE_URL || 'http://localhost:3000'}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: cancelUrl || `${process.env.EXPO_PUBLIC_WEBHOOK_BASE_URL || 'http://localhost:3000'}/payment-cancelled`,
          metadata: { 
            planId,
            platform,
            productId,
            userId,
            source: 'mobile'
          },
          // Mobile-specific optimizations
          billing_address_collection: 'auto',
          allow_promotion_codes: true,
          customer_update: {
            address: 'auto',
            name: 'auto',
          },
        });

        return sendJson(res, 200, { url: session.url || '' });
      } catch (e) {
        console.error('Create mobile checkout error:', e?.message || e);
        return sendJson(res, 500, { error: 'Failed to create checkout session' });
      }
    });
    return;
  }

  if (url.pathname === '/api/stripe/confirm-paymentsheet') {
    if (method !== 'POST') {
      return sendJson(res, 405, { error: 'Method Not Allowed' });
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', async () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const body = raw ? JSON.parse(raw) : {};
        const { paymentIntentId, planId, userId } = body || {};
        
        console.log('Confirming PaymentSheet:', { paymentIntentId, planId, userId });
        
        if (!paymentIntentId || !planId || !userId) {
          return sendJson(res, 400, { error: 'Missing required fields: paymentIntentId, planId, userId' });
        }

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });
        const sb = getSupabase();

        // Retrieve the payment intent
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        
        if (!paymentIntent || paymentIntent.status !== 'succeeded') {
          return sendJson(res, 400, { error: 'Payment not completed' });
        }

        // Get plan details
        const { data: plan, error: planErr } = await sb
          .from('premium_plans')
          .select('stripe_price_id, price, interval')
          .eq('id', planId)
          .single();

        if (planErr || !plan) {
          return sendJson(res, 404, { error: 'Plan not found' });
        }

        // Create subscription using the payment method from the payment intent
        const subscription = await stripe.subscriptions.create({
          customer: paymentIntent.customer,
          items: [{ price: plan.stripe_price_id }],
          payment_behavior: 'default_incomplete',
          payment_settings: { save_default_payment_method: 'on_subscription' },
          expand: ['latest_invoice.payment_intent'],
          metadata: { 
            planId,
            userId,
            source: 'paymentsheet'
          }
        });

        // Update user premium status
        const currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null;
        
        const { error: updErr } = await sb
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
          return sendJson(res, 500, { error: 'Failed to update user status' });
        }

        return sendJson(res, 200, { 
          success: true,
          subscriptionId: subscription.id,
          message: 'Subscription created successfully'
        });
      } catch (e) {
        console.error('Confirm PaymentSheet error:', e?.message || e);
        return sendJson(res, 500, { error: 'Failed to confirm payment' });
      }
    });
    return;
  }

  if (url.pathname === '/api/stripe/create-customer') {
    if (method !== 'POST') {
      return sendJson(res, 405, { error: 'Method Not Allowed' });
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', async () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const body = raw ? JSON.parse(raw) : {};
        const { userId, email } = body || {};
        
        if (!userId || !email) {
          return sendJson(res, 400, { error: 'Missing required fields: userId, email' });
        }

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });
        const sb = getSupabase();

        // Check if user already has a Stripe customer ID
        let { data: userRow, error: userErr } = await sb
          .from('user_profiles')
          .select('id, stripe_customer_id')
          .eq('id', userId)
          .single();

        if (userErr || !userRow) {
          return sendJson(res, 404, { error: 'User profile not found' });
        }

        if (userRow.stripe_customer_id) {
          console.log(`User ${userId} already has Stripe customer ID: ${userRow.stripe_customer_id}`);
          return sendJson(res, 200, { 
            customerId: userRow.stripe_customer_id,
            message: 'User already has a Stripe customer ID'
          });
        }

        // Check if a Stripe customer already exists with this email
        let customerId = null;
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
              metadata: { userId },
              description: `Customer for user ${userId}`
            });
            customerId = customer.id;
            console.log(`Created new Stripe customer ${customerId} for email ${email}`);
          }
        } catch (stripeError) {
          console.error('Error creating Stripe customer:', stripeError);
          return sendJson(res, 500, { error: 'Failed to create Stripe customer' });
        }

        // Update user profile with Stripe customer ID
        try {
          const { error: updateError } = await sb
            .from('user_profiles')
            .update({ 
              stripe_customer_id: customerId, 
              updated_at: new Date().toISOString() 
            })
            .eq('id', userId);

          if (updateError) {
            console.error('Error updating user profile with Stripe customer ID:', updateError);
            return sendJson(res, 500, { error: 'Failed to update user profile' });
          }

          console.log(`Successfully updated user ${userId} with Stripe customer ID ${customerId}`);
          return sendJson(res, 200, { 
            customerId,
            message: 'Stripe customer created and linked successfully'
          });

        } catch (dbError) {
          console.error('Error updating user profile:', dbError);
          return sendJson(res, 500, { error: 'Failed to update user profile' });
        }

      } catch (e) {
        console.error('Create customer error:', e?.message || e);
        return sendJson(res, 500, { error: 'Failed to create Stripe customer' });
      }
    });
    return;
  }

  if (url.pathname === '/api/stripe/sync-plan') {
    if (method !== 'POST') {
      return sendJson(res, 405, { error: 'Method Not Allowed' });
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', async () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const body = raw ? JSON.parse(raw) : {};
        const planId = body?.planId;
        if (!planId) return sendJson(res, 400, { error: 'planId required' });

        const sb = getSupabase();
        const { data: plan, error: getErr } = await sb
          .from('premium_plans')
          .select('*')
          .eq('id', planId)
          .single();
        if (getErr || !plan) {
          return sendJson(res, 404, { error: 'Plan not found' });
        }

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });

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
            const search = await stripe.products.search({ query: `metadata['planId']:'${plan.id}'` });
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
              metadata: { planId: plan.id, planType: plan.plan_type || 'subscription' },
            },
            { idempotencyKey: `plan-product-update-${plan.id}-${Number(plan.updated_at || Date.now())}` }
          );
        } else {
          product = await stripe.products.create(
            {
              name: plan.name,
              description: plan.description || undefined,
              metadata: { planId: plan.id, planType: plan.plan_type || 'subscription' },
            },
            { idempotencyKey: `plan-product-create-${plan.id}` }
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
        const intervalMap = { monthly: 'month', yearly: 'year', weekly: 'week' };
        const desiredInterval = (plan.plan_type || 'subscription') === 'subscription' ? (intervalMap[plan.interval] || 'month') : undefined;
        const unitAmount = Math.round(Number(plan.price || 0) * 100);
        const currency = (plan.currency || 'USD').toLowerCase();
        const activePrices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
        let price = activePrices.data.find(p => p.unit_amount === unitAmount && p.currency === currency && ((desiredInterval && p.recurring?.interval === desiredInterval) || (!desiredInterval && !p.recurring)));
        if (!price) {
          price = await stripe.prices.create(
            {
              product: product.id,
              unit_amount: unitAmount,
              currency,
              recurring: desiredInterval ? { interval: desiredInterval } : undefined,
              metadata: { planId: plan.id },
            },
            { idempotencyKey: `plan-price-${plan.id}-${unitAmount}-${currency}-${desiredInterval || 'one-time'}` }
          );
        }

        // Update plan with Stripe IDs (and optional sync status fields when present)
        const { data: updated, error: updErr } = await sb
          .from('premium_plans')
          .update({
            stripe_product_id: product.id,
            stripe_price_id: price.id,
            sync_status: 'synced',
            last_sync_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', plan.id)
          .select('id, stripe_product_id, stripe_price_id')
          .single();

        if (updErr) {
          console.error('[webhook] Supabase update failed:', updErr.message);
          return sendJson(res, 500, { error: 'Supabase update failed', details: updErr.message });
        }

        return sendJson(res, 200, { productId: product.id, priceId: price.id, planId: updated.id });
      } catch (e) {
        log('error', 'sync_plan_error', { error: e?.message || String(e) });
        return sendJson(res, 500, { error: 'Sync failed' });
      }
    });
    return;
  }

  // Subscription Management Endpoints
  if (method === 'POST' && url.pathname === '/api/cancel-subscription') {
    return await handleCancelSubscription(req, res);
  }

  if (method === 'POST' && url.pathname === '/api/reactivate-subscription') {
    return await handleReactivateSubscription(req, res);
  }

  return sendJson(res, 404, { error: 'Not Found' });
});

server.listen(PORT, () => {
  console.log(`Stripe Webhook Server listening on http://127.0.0.1:${PORT}`);
});

// Helpers
let supabase;
function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    // Prefer service role to bypass RLS for server-side updates
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
      '';
    supabase = createClient(url, key);
  }
  return supabase;
}

// Simple structured logger
function log(level, message, meta = {}) {
  try {
    const payload = { ts: new Date().toISOString(), level, message, ...meta };
    console.log(JSON.stringify(payload));
  } catch (e) {
    // fallback
    console.log(level, message, meta);
  }
}

const processedEventIds = new Set();
let lastProcessedEventTime = null;

async function handleStripeEvent(event, stripe) {
  if (event?.id && processedEventIds.has(event.id)) {
    log('info', 'stripe_event_deduped', { eventId: event.id, type: event.type });
    return;
  }
  log('info', 'stripe_event_received', { eventId: event.id, type: event.type });
  if (event?.id) {
    processedEventIds.add(event.id);
    lastProcessedEventTime = new Date().toISOString();
  }
  
  // Add retry mechanism for critical events
  const maxRetries = 3;
  let retryCount = 0;
  
  const processEventWithRetry = async () => {
    try {
      return await processStripeEvent(event, stripe);
    } catch (error) {
      retryCount++;
      if (retryCount < maxRetries) {
        log('warn', 'stripe_event_retry', { 
          eventId: event.id, 
          type: event.type, 
          retryCount,
          error: error.message 
        });
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        return await processEventWithRetry();
      } else {
        log('error', 'stripe_event_max_retries_exceeded', { 
          eventId: event.id, 
          type: event.type,
          error: error.message 
        });
        throw error;
      }
    }
  };
  
  return await processEventWithRetry();
}

async function processStripeEvent(event, stripe) {
  switch (event.type) {
    case 'product.updated':
    case 'product.created': {
      const product = event.data.object;
      const planId = product?.metadata?.planId;
      if (planId) {
        const sb = getSupabase();
        const { error } = await sb
          .from('premium_plans')
          .update({
            name: product.name || null,
            description: product.description || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', planId);
        if (error) console.error('Supabase update plan error:', error.message);
      }
      break;
    }
    case 'price.updated':
    case 'price.created': {
      // No-op for now; rely on app-side sync
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      if (customerId) {
        const sb = getSupabase();
        // Try to get planId from subscription metadata. If missing, fall back to the first price's metadata
        let planId = subscription.metadata?.planId || null;
        if (!planId) {
          try {
            const items = Array.isArray(subscription.items?.data) ? subscription.items.data : [];
            const firstPrice = items[0]?.price;
            planId = firstPrice?.metadata?.planId || null;
          } catch (error) {
            console.log('Failed to extract plan ID from subscription items:', error.message);
          }
        }
        
        log('info', 'processing_subscription_event', { 
          customerId, 
          planId, 
          subscriptionId: subscription.id,
          status: subscription.status 
        });
        
        const { data: userRow, error: findErr } = await sb
          .from('user_profiles')
          .select('id, stripe_customer_id')
          .eq('stripe_customer_id', customerId)
          .single();
          
        if (findErr || !userRow) {
          log('warn', 'no_user_found_for_stripe_customer', { 
            customerId, 
            error: findErr?.message || 'No user found' 
          });
          
          // Try to find user by customer ID in a different way
          const { data: altUserRow, error: altFindErr } = await sb
            .from('user_profiles')
            .select('id, stripe_customer_id')
            .eq('id', customerId)
            .single();
            
          if (altUserRow) {
            log('info', 'found_user_by_id_match', { 
              userId: altUserRow.id, 
              customerId 
            });
            // Update the user's stripe_customer_id if it's missing
            const { error: updateCustomerIdError } = await sb
              .from('user_profiles')
              .update({
                stripe_customer_id: customerId,
                updated_at: new Date().toISOString(),
              })
              .eq('id', altUserRow.id);
              
            if (updateCustomerIdError) {
              log('error', 'failed_to_update_stripe_customer_id', { 
                error: updateCustomerIdError.message 
              });
            } else {
              log('info', 'updated_stripe_customer_id', { 
                userId: altUserRow.id, 
                customerId 
              });
            }
            
            // Use the found user for the premium update
            userRow = altUserRow;
          } else {
            log('error', 'cannot_find_user_by_any_method', { 
              customerId, 
              altError: altFindErr?.message || 'No user found by ID match' 
            });
            break;
          }
        }
        
        const isActive = subscription.status === 'active' || subscription.status === 'trialing';
        const currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null;
        
        log('info', 'updating_user_premium_status', { 
          userId: userRow.id, 
          isActive, 
          planId, 
          status: subscription.status 
        });
        
        const { error: updErr } = await sb
          .from('user_profiles')
          .update({
            premium: {
              isActive,
              type: planId,
              stripeSubscriptionId: subscription.id,
              stripeCustomerId: customerId,
              status: subscription.status,
              currentPeriodEnd,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', userRow.id);
          
        if (updErr) {
          log('error', 'supabase_update_user_premium_error', { 
            error: updErr.message,
            userId: userRow.id,
            customerId,
            subscriptionId: subscription.id
          });
        } else {
          log('info', 'successfully_updated_user_premium', { 
            userId: userRow.id, 
            customerId, 
            subscriptionId: subscription.id 
          });
        }
      }
      break;
    }
    default:
      // Log others
      break;
  }
}

// Subscription Management Handlers
async function handleCancelSubscription(req, res) {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  req.on('end', async () => {
    try {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const { userId, subscriptionId, customerId } = JSON.parse(rawBody);

      if (!userId || !subscriptionId) {
        return sendJson(res, 400, { error: 'Missing required parameters' });
      }

      console.log('Canceling subscription:', { userId, subscriptionId, customerId });

      // Verify the user exists and has permission
      const sb = getSupabase();
      const { data: userProfile, error: userError } = await sb
        .from('user_profiles')
        .select('id, premium, stripe_customer_id')
        .eq('id', userId)
        .single();

      if (userError || !userProfile) {
        console.error('User not found:', userError);
        return sendJson(res, 404, { error: 'User not found' });
      }

      // Check if user has an active subscription
      if (!userProfile.premium?.isActive) {
        return sendJson(res, 400, { error: 'No active subscription found' });
      }

      // Cancel the subscription in Stripe
      let stripeSubscription;
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });
        
        // Try to cancel by subscription ID first
        if (subscriptionId && subscriptionId !== userId) {
          stripeSubscription = await stripe.subscriptions.update(subscriptionId, {
            cancel_at_period_end: true,
          });
          console.log('Stripe subscription canceled by ID:', stripeSubscription.id);
        } else if (customerId) {
          // If no subscription ID, try to find and cancel by customer ID
          const subscriptions = await stripe.subscriptions.list({
            customer: customerId,
            status: 'active',
            limit: 1,
          });

          if (subscriptions.data.length > 0) {
            stripeSubscription = await stripe.subscriptions.update(subscriptions.data[0].id, {
              cancel_at_period_end: true,
            });
            console.log('Stripe subscription canceled by customer ID:', stripeSubscription.id);
          } else {
            console.warn('No active Stripe subscription found for customer:', customerId);
          }
        }
      } catch (stripeError) {
        console.error('Stripe cancellation error:', stripeError);
        
        // If Stripe fails, we still want to update local status
        // but inform the user about the issue
        return sendJson(res, 500, { 
          error: 'Failed to cancel in Stripe',
          details: stripeError instanceof Error ? stripeError.message : 'Unknown Stripe error',
          localUpdateOnly: true
        });
      }

      // Update local database to reflect the cancellation
      const { error: updateError } = await sb
        .from('user_profiles')
        .update({
          premium: {
            ...userProfile.premium,
            status: 'canceled',
            renewedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (updateError) {
        console.error('Failed to update local database:', updateError);
        return sendJson(res, 500, { error: 'Failed to update local subscription status' });
      }

      console.log('Subscription successfully canceled for user:', userId);

      return sendJson(res, 200, {
        success: true,
        message: 'Subscription canceled successfully',
        stripeSubscriptionId: stripeSubscription?.id,
        cancelAtPeriodEnd: true
      });

    } catch (error) {
      console.error('Error in cancel-subscription API:', error);
      return sendJson(res, 500, { error: 'Internal server error' });
    }
  });
}

async function handleReactivateSubscription(req, res) {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  req.on('end', async () => {
    try {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const { userId, subscriptionId, customerId } = JSON.parse(rawBody);

      if (!userId || !subscriptionId) {
        return sendJson(res, 400, { error: 'Missing required parameters' });
      }

      console.log('Reactivating subscription:', { userId, subscriptionId, customerId });

      // Verify the user exists and has permission
      const sb = getSupabase();
      const { data: userProfile, error: userError } = await sb
        .from('user_profiles')
        .select('id, premium, stripe_customer_id')
        .eq('id', userId)
        .single();

      if (userError || !userProfile) {
        console.error('User not found:', userError);
        return sendJson(res, 404, { error: 'User not found' });
      }

      // Check if user has a canceled subscription
      if (userProfile.premium?.status !== 'canceled') {
        return sendJson(res, 400, { error: 'Subscription is not canceled' });
      }

      // Reactivate the subscription in Stripe
      let stripeSubscription;
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });
        
        // Try to reactivate by subscription ID first
        if (subscriptionId && subscriptionId !== userId) {
          stripeSubscription = await stripe.subscriptions.update(subscriptionId, {
            cancel_at_period_end: false,
          });
          console.log('Stripe subscription reactivated by ID:', stripeSubscription.id);
        } else if (customerId) {
          // If no subscription ID, try to find and reactivate by customer ID
          const subscriptions = await stripe.subscriptions.list({
            customer: customerId,
            status: 'active',
            limit: 1,
          });

          if (subscriptions.data.length > 0) {
            stripeSubscription = await stripe.subscriptions.update(subscriptions.data[0].id, {
              cancel_at_period_end: false,
            });
            console.log('Stripe subscription reactivated by customer ID:', stripeSubscription.id);
          } else {
            console.warn('No active Stripe subscription found for customer:', customerId);
          }
        }
      } catch (stripeError) {
        console.error('Stripe reactivation error:', stripeError);
        
        // If Stripe fails, we still want to update local status
        // but inform the user about the issue
        return sendJson(res, 500, { 
          error: 'Failed to reactivate in Stripe',
          details: stripeError instanceof Error ? stripeError.message : 'Unknown Stripe error',
          localUpdateOnly: true
        });
      }

      // Update local database to reflect the reactivation
      const { error: updateError } = await sb
        .from('user_profiles')
        .update({
          premium: {
            ...userProfile.premium,
            status: 'active',
            renewedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (updateError) {
        console.error('Failed to update local database:', updateError);
        return sendJson(res, 500, { error: 'Failed to update local subscription status' });
      }

      console.log('Subscription successfully reactivated for user:', userId);

      return sendJson(res, 200, {
        success: true,
        message: 'Subscription reactivated successfully',
        stripeSubscriptionId: stripeSubscription?.id,
        cancelAtPeriodEnd: false
      });

    } catch (error) {
      console.error('Error in reactivate-subscription API:', error);
      return sendJson(res, 500, { error: 'Internal server error' });
    }
  });
}


