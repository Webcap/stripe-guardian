// Get billing history for a customer
const { wiznoteAdmin } = require('../../server/lib/supabase-admin');
const Stripe = require('stripe');

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2025-07-30.basil'
});

// Use wiznoteAdmin as supabase client for accessing user_profiles
const supabase = wiznoteAdmin;

module.exports = async (req, res) => {
    // Set CORS headers
    const allowedOrigins = [
        'https://stripe.webcap.media',
        'https://webcap.media',
        'http://localhost:8081',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:8081',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001'
    ];
    
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', 'https://stripe.webcap.media');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    // Handle preflight request
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // Only allow POST requests
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        return;
    }
    
    try {
        const { userId, limit = 10 } = req.body;
        
        if (!userId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                success: false,
                error: 'Missing userId' 
            }));
            return;
        }
        
        console.log('Fetching billing history for user:', userId);
        
        // Get user's Stripe customer ID from Supabase
        const { data: userProfile, error: profileError } = await supabase
            .from('user_profiles')
            .select('stripe_customer_id')
            .eq('id', userId)
            .single();
        
        if (profileError || !userProfile) {
            console.error('Error fetching user profile:', profileError);
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                success: false,
                error: 'User not found',
                billingHistory: []
            }));
            return;
        }
        
        const stripeCustomerId = userProfile.stripe_customer_id;
        
        if (!stripeCustomerId) {
            console.log('User has no Stripe customer ID');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                success: true,
                billingHistory: [],
                message: 'User has no billing history'
            }));
            return;
        }
        
        // Fetch invoices from Stripe
        console.log('Fetching invoices from Stripe for customer:', stripeCustomerId);
        const invoices = await stripe.invoices.list({
            customer: stripeCustomerId,
            limit: Math.min(limit, 100) // Cap at 100 for safety
        });
        
        // Transform invoices into billing history format
        const billingHistory = invoices.data.map(invoice => ({
            id: invoice.id,
            amount: invoice.amount_paid / 100, // Convert from cents to dollars
            currency: invoice.currency.toUpperCase(),
            status: invoice.status,
            date: new Date(invoice.created * 1000).toISOString(),
            periodStart: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
            periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
            description: invoice.lines?.data[0]?.description || 'Subscription payment',
            invoiceUrl: invoice.hosted_invoice_url,
            invoicePdf: invoice.invoice_pdf,
            amountDue: invoice.amount_due / 100,
            amountRemaining: invoice.amount_remaining / 100,
            paid: invoice.paid,
            attempted: invoice.attempted
        }));
        
        console.log(`Found ${billingHistory.length} invoices for user ${userId}`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            success: true,
            billingHistory,
            count: billingHistory.length
        }));
        
    } catch (error) {
        console.error('Error fetching billing history:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            success: false,
            error: 'Failed to fetch billing history',
            message: error.message,
            billingHistory: []
        }));
    }
};

