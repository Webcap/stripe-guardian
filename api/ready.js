import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', 'https://stripe.webcap.media');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    
    const readiness = { ok: true, checks: { env: {} } };
    
    // Check environment variables
    readiness.checks.env = {
        STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
        STRIPE_WEBHOOK_SECRET: !!process.env.STRIPE_WEBHOOK_SECRET,
        SUPABASE_URL: !!process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
    
    // Check Stripe connection
    try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { 
            apiVersion: '2025-07-30.basil' 
        });
        await stripe.products.list({ limit: 1 });
        readiness.checks.stripe = true;
    } catch (e) {
        readiness.ok = false;
        readiness.checks.stripe = false;
    }
    
    // Check Supabase connection
    try {
        const supabase = createClient(
            process.env.SUPABASE_URL || '', 
            process.env.SUPABASE_SERVICE_ROLE_KEY || ''
        );
        await supabase.from('user_profiles').select('id').limit(1);
        readiness.checks.supabase = true;
    } catch (e) {
        readiness.ok = false;
        readiness.checks.supabase = false;
    }
    
    // Check if all environment variables are present
    if (!Object.values(readiness.checks.env).every(Boolean)) {
        readiness.ok = false;
    }
    
    return res.status(readiness.ok ? 200 : 503).json(readiness);
}
