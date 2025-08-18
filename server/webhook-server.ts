import 'dotenv/config';
import * as http from 'http';
import { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { stripeService } from '../services/StripeService.server';

const PORT = Number(process.env.WEBHOOK_PORT || 3001);

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function handleWebhook(req: IncomingMessage, res: ServerResponse) {
  try {
    const signature = req.headers['stripe-signature'];
    if (!signature || typeof signature !== 'string') {
      return sendJson(res, 400, { error: 'Missing Stripe-Signature header' });
    }

    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', async () => {
      try {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        const event = await stripeService.verifyWebhookSignature(rawBody, signature);
        await stripeService.handleWebhook(event);
        return sendJson(res, 200, { received: true });
      } catch (err: any) {
        console.error('Webhook handling error:', err?.message || err);
        return sendJson(res, 400, { error: 'Webhook Error' });
      }
    });
  } catch (error: any) {
    console.error('Webhook request error:', error?.message || error);
    return sendJson(res, 500, { error: 'Internal Server Error' });
  }
}

async function handleCreateCheckout(req: IncomingMessage, res: ServerResponse) {
  try {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', async () => {
      try {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        const body = JSON.parse(rawBody);
        const { userId, email, planId, priceId, successUrl = '', cancelUrl = '' } = body;

        if (!userId || !email || !planId || !priceId) {
          return sendJson(res, 400, { 
            error: 'Missing required fields: userId, email, planId, priceId' 
          });
        }

        // Check if a Stripe customer already exists with this email
        let customerId: string;
        try {
          const existingCustomers = await stripeService.getStripeInstance().customers.list({ email, limit: 1 });
          if (existingCustomers.data && existingCustomers.data.length > 0) {
            // Use existing customer
            customerId = existingCustomers.data[0].id;
            console.log(`Found existing Stripe customer ${customerId} for email ${email}`);
          } else {
            // Create new customer
            customerId = await stripeService.getOrCreateCustomer(userId, email);
            console.log(`Created new Stripe customer ${customerId} for email ${email}`);
          }
        } catch (stripeError: any) {
          console.error('Error checking/creating Stripe customer:', stripeError);
          return sendJson(res, 500, { error: 'Failed to create or find Stripe customer' });
        }

        const url = await stripeService.createCheckoutSession(
          customerId,
          priceId,
          successUrl,
          cancelUrl
        );

        return sendJson(res, 200, { url });
      } catch (err: any) {
        console.error('Create checkout error:', err?.message || err);
        return sendJson(res, 500, { 
          error: err?.message || 'Failed to create checkout session' 
        });
      }
    });
  } catch (error: any) {
    console.error('Create checkout request error:', error?.message || error);
    return sendJson(res, 500, { error: 'Internal Server Error' });
  }
}

async function handleVerifySession(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('session_id');
    
    if (!sessionId) {
      return sendJson(res, 400, { error: 'Missing session_id' });
    }

    try {
      // Get the checkout session first (not subscription)
      const checkoutSession = await stripeService.getCheckoutSession(sessionId);
      
      if (!checkoutSession) {
        return sendJson(res, 404, { error: 'Checkout session not found' });
      }

      // Check if payment was successful
      if (checkoutSession.payment_status !== 'paid') {
        return sendJson(res, 200, { 
          premiumGranted: false, 
          message: 'Payment not yet completed',
          status: checkoutSession.payment_status 
        });
      }

      // Get the customer ID from the checkout session
      const customerId = checkoutSession.customer as string;
      if (!customerId) {
        return sendJson(res, 400, { error: 'No customer ID in checkout session' });
      }

      // Get the subscription ID if this was a subscription
      const subscriptionId = checkoutSession.subscription as string;
      
      // Update user's premium status in the database
      const { error: updateError } = await stripeService.updateUserPremiumStatus(customerId, true);
      
      if (updateError) {
        console.error('Error updating user premium status:', updateError);
        return sendJson(res, 500, { error: 'Failed to update premium status' });
      }

      return sendJson(res, 200, { 
        premiumGranted: true, 
        customerId,
        subscriptionId,
        message: 'Premium access granted successfully'
      });

    } catch (stripeError: any) {
      console.error('Stripe error during session verification:', stripeError);
      return sendJson(res, 500, { 
        error: 'Stripe verification failed', 
        details: stripeError.message 
      });
    }
  } catch (error: any) {
    console.error('Verify session error:', error?.message || error);
    return sendJson(res, 500, { error: 'Verification failed' });
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
    const readiness: { 
      ok: boolean; 
      checks: { 
        env: { [key: string]: boolean }; 
        stripe?: boolean; 
        supabase?: boolean; 
      } 
    } = { ok: true, checks: { env: {} } };
    
    readiness.checks.env = {
      STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: !!process.env.STRIPE_WEBHOOK_SECRET,
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
    
    try {
      const stripe = new (require('stripe'))(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2025-07-30.basil' });
      await stripe.products.list({ limit: 1 });
      readiness.checks.stripe = true;
    } catch (e) {
      readiness.ok = false;
      readiness.checks.stripe = false;
    }
    
    try {
      const { createClient } = require('@supabase/supabase-js');
      const sb = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
      await sb.from('premium_plans').select('id').limit(1);
      readiness.checks.supabase = true;
    } catch (e) {
      readiness.ok = false;
      readiness.checks.supabase = false;
    }
    
    if (!Object.values(readiness.checks.env).every(Boolean)) readiness.ok = false;
    return sendJson(res, readiness.ok ? 200 : 503, readiness);
  }

  if (url.pathname === '/api/stripe/webhook') {
    if (method !== 'POST') {
      return sendJson(res, 405, { error: 'Method Not Allowed' });
    }
    return handleWebhook(req, res);
  }

  if (url.pathname === '/api/stripe/create-checkout') {
    if (method !== 'POST') {
      return sendJson(res, 405, { error: 'Method Not Allowed' });
    }
    return handleCreateCheckout(req, res);
  }

  if (url.pathname === '/api/stripe/verify-session') {
    if (method !== 'GET') {
      return sendJson(res, 405, { error: 'Method Not Allowed' });
    }
    return handleVerifySession(req, res);
  }

  return sendJson(res, 404, { error: 'Not Found' });
});

server.listen(PORT, () => {
  console.log(`Stripe Webhook Server listening on http://127.0.0.1:${PORT}`);
});


