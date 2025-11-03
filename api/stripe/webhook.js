// Stripe webhook handler for Stripe Guardian
const { wiznoteAdmin } = require('../../server/lib/supabase-admin');
const Stripe = require('stripe');

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2025-07-30.basil'
});

// Use wiznoteAdmin as supabase client for accessing user_profiles
const supabase = wiznoteAdmin;

// Handle webhook events
async function handleWebhookEvent(event) {
    try {
        console.log('Handling webhook event:', event.type);
        
        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutSessionCompleted(event.data.object);
                break;
            case 'customer.created':
                await handleCustomerCreated(event.data.object);
                break;
            case 'customer.updated':
                await handleCustomerUpdated(event.data.object);
                break;
            case 'customer.subscription.created':
                await handleSubscriptionCreated(event.data.object);
                break;
            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(event.data.object);
                break;
            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object);
                break;
            case 'invoice.payment_succeeded':
                await handlePaymentSucceeded(event.data.object);
                break;
            case 'invoice.payment_failed':
                await handlePaymentFailed(event.data.object);
                break;
            default:
                console.log(`Unhandled webhook event type: ${event.type}`);
        }
    } catch (error) {
        console.error('Error handling webhook event:', error);
        throw error;
    }
}

// Checkout session completed handler
async function handleCheckoutSessionCompleted(session) {
    try {
        console.log(`Checkout session completed: ${session.id} for customer ${session.customer}`);
        console.log('Session details:', {
            customer: session.customer,
            subscription: session.subscription,
            payment_status: session.payment_status,
            mode: session.mode
        });
        
        // For subscription mode, get the subscription details
        if (session.mode === 'subscription' && session.subscription) {
            console.log(`Fetching subscription details for: ${session.subscription}`);
            
            // Retrieve the subscription to get full details
            const subscription = await stripe.subscriptions.retrieve(session.subscription);
            
            console.log('Subscription retrieved:', {
                id: subscription.id,
                status: subscription.status,
                customer: subscription.customer
            });
            
            // Update user's premium status immediately
            const currentPeriodEnd = subscription.current_period_end 
                ? new Date(subscription.current_period_end * 1000).toISOString() 
                : null;
            const currentPeriodStart = subscription.current_period_start 
                ? new Date(subscription.current_period_start * 1000).toISOString() 
                : null;
            
            // Try to extract planId from subscription metadata
            const planId = subscription.metadata?.planId || subscription.items.data[0]?.price.id;
            
            const { error: updateError } = await supabase
                .from('user_profiles')
                .update({ 
                    premium: {
                        isActive: true,
                        planId: planId,
                        stripeSubscriptionId: subscription.id,
                        stripeCustomerId: session.customer,
                        status: subscription.status,
                        currentPeriodEnd: currentPeriodEnd,
                        currentPeriodStart: currentPeriodStart,
                        startedAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    },
                    updated_at: new Date().toISOString()
                })
                .eq('stripe_customer_id', session.customer);
            
            if (updateError) {
                console.error('Error updating premium status after checkout:', updateError);
            } else {
                console.log(`Updated premium status for customer ${session.customer} after checkout completion`);
            }
        } else if (session.mode === 'payment') {
            // Handle one-time payment
            console.log('One-time payment completed');
            
            const { error: updateError } = await supabase
                .from('user_profiles')
                .update({ 
                    stripe_customer_id: session.customer,
                    updated_at: new Date().toISOString()
                })
                .eq('stripe_customer_id', session.customer);
            
            if (updateError) {
                console.error('Error updating user after one-time payment:', updateError);
            } else {
                console.log(`Updated user ${session.customer} after one-time payment`);
            }
        }
    } catch (error) {
        console.error('Error handling checkout session completed:', error);
    }
}

// Customer sync handlers
async function handleCustomerCreated(customer) {
    try {
        console.log(`Syncing new customer: ${customer.id} (${customer.email})`);
        
        // Check if user exists in Supabase by Stripe customer ID first
        const { data: existingUser, error: userError } = await supabase
            .from('user_profiles')
            .select('id, stripe_customer_id')
            .eq('stripe_customer_id', customer.id)
            .single();
        
        // If no user found by Stripe customer ID, try to find by email in auth.users
        let userByEmail = null;
        if (userError && userError.code === 'PGRST116') {
            try {
                // Use auth admin API to find user by email
                const { data: authUser, error: authError } = await supabase.auth.admin.listUsers();
                if (!authError && authUser.users) {
                    userByEmail = authUser.users.find(u => u.email === customer.email);
                }
            } catch (authError) {
                console.warn('Could not check auth.users for email:', authError);
            }
        }
        
        if (userError && userError.code !== 'PGRST116') {
            console.error('Error checking existing user:', userError);
            return;
        }
        
        if (existingUser) {
            // Update existing user with Stripe customer ID
            const { error: updateError } = await supabase
                .from('user_profiles')
                .update({ 
                    stripe_customer_id: customer.id,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingUser.id);
            
            if (updateError) {
                console.error('Error updating user with Stripe customer ID:', updateError);
            } else {
                console.log(`Updated user ${existingUser.id} with Stripe customer ID ${customer.id}`);
            }
        } else if (userByEmail) {
            // User exists in auth but not in user_profiles, create profile
            const { error: insertError } = await supabase
                .from('user_profiles')
                .insert({
                    id: userByEmail.id,
                    stripe_customer_id: customer.id,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
            
            if (insertError) {
                console.error('Error creating new user profile:', insertError);
            } else {
                console.log(`Created new user profile for existing auth user ${userByEmail.id}`);
            }
        } else {
            // No user found, this is a new customer
            console.log(`No existing user found for Stripe customer ${customer.id} (${customer.email})`);
            console.log('Note: New users should be created through the main application, not via Stripe webhooks');
        }
    } catch (error) {
        console.error('Error handling customer created:', error);
    }
}

async function handleCustomerUpdated(customer) {
    try {
        console.log(`Customer updated: ${customer.id} (${customer.email})`);
        
        // Update user profile with latest customer data
        const { error: updateError } = await supabase
            .from('user_profiles')
            .update({ 
                stripe_customer_id: customer.id,
                updated_at: new Date().toISOString()
            })
            .eq('stripe_customer_id', customer.id);
        
        if (updateError) {
            console.error('Error updating user profile:', updateError);
        } else {
            console.log(`Updated user profile for customer ${customer.id}`);
        }
    } catch (error) {
        console.error('Error handling customer updated:', error);
    }
}

async function handleSubscriptionCreated(subscription) {
    try {
        console.log(`Subscription created: ${subscription.id} for customer ${subscription.customer}`);
        console.log('Subscription status:', subscription.status);
        
        // Only mark as premium if subscription is active or trialing
        const isActive = ['active', 'trialing'].includes(subscription.status);
        const currentPeriodEnd = subscription.current_period_end 
            ? new Date(subscription.current_period_end * 1000).toISOString() 
            : null;
        const currentPeriodStart = subscription.current_period_start 
            ? new Date(subscription.current_period_start * 1000).toISOString() 
            : null;
        
        // Extract planId from subscription metadata
        const planId = subscription.metadata?.planId || subscription.items.data[0]?.price.id;
        
        // Update user's premium status
        const { error: updateError } = await supabase
            .from('user_profiles')
            .update({ 
                premium: {
                    isActive: isActive,
                    planId: planId,
                    stripeSubscriptionId: subscription.id,
                    stripeCustomerId: subscription.customer,
                    status: subscription.status,
                    currentPeriodEnd: currentPeriodEnd,
                    currentPeriodStart: currentPeriodStart,
                    startedAt: isActive ? new Date().toISOString() : undefined,
                    updatedAt: new Date().toISOString()
                },
                updated_at: new Date().toISOString()
            })
            .eq('stripe_customer_id', subscription.customer);
        
        if (updateError) {
            console.error('Error updating premium status:', updateError);
        } else {
            console.log(`Updated premium status for customer ${subscription.customer} (isActive: ${isActive}, status: ${subscription.status})`);
        }
    } catch (error) {
        console.error('Error handling subscription created:', error);
    }
}

async function handleSubscriptionUpdated(subscription) {
    try {
        console.log(`Subscription updated: ${subscription.id} for customer ${subscription.customer}`);
        console.log('New subscription status:', subscription.status);
        
        // First, get the existing premium data to preserve fields
        const { data: existingProfile } = await supabase
            .from('user_profiles')
            .select('premium')
            .eq('stripe_customer_id', subscription.customer)
            .single();
        
        const existingPremium = existingProfile?.premium || {};
        
        // Update premium status based on subscription status
        const isActive = ['active', 'trialing'].includes(subscription.status);
        const currentPeriodEnd = subscription.current_period_end 
            ? new Date(subscription.current_period_end * 1000).toISOString() 
            : null;
        const currentPeriodStart = subscription.current_period_start 
            ? new Date(subscription.current_period_start * 1000).toISOString() 
            : null;
        
        // Extract planId from subscription metadata
        const planId = subscription.metadata?.planId || subscription.items.data[0]?.price.id;
        
        // Build updated premium object, preserving existing fields
        // Preserve billing dates if they already exist (e.g., from original subscription creation)
        // Only use Stripe's dates if we don't have existing ones
        const updatedPremium = {
            ...existingPremium, // Preserve all existing fields
            isActive: isActive,
            planId: planId,
            type: planId, // Keep for backwards compatibility
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: subscription.customer,
            status: subscription.status,
            currentPeriodEnd: existingPremium.currentPeriodEnd || currentPeriodEnd,
            currentPeriodStart: existingPremium.currentPeriodStart || currentPeriodStart,
            cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
            updatedAt: new Date().toISOString()
        };
        
        // Add canceledAt if subscription was canceled
        if (subscription.canceled_at) {
            updatedPremium.canceledAt = new Date(subscription.canceled_at * 1000).toISOString();
        }
        
        // Update subscription status
        const { error: updateError } = await supabase
            .from('user_profiles')
            .update({ 
                premium: updatedPremium,
                updated_at: new Date().toISOString()
            })
            .eq('stripe_customer_id', subscription.customer);
        
        if (updateError) {
            console.error('Error updating subscription status:', updateError);
        } else {
            console.log(`Updated subscription status for customer ${subscription.customer} (isActive: ${isActive}, status: ${subscription.status})`);
        }
    } catch (error) {
        console.error('Error handling subscription updated:', error);
    }
}

async function handleSubscriptionDeleted(subscription) {
    try {
        console.log(`Subscription deleted: ${subscription.id} for customer ${subscription.customer}`);
        
        // Get existing premium data to preserve fields
        const { data: existingProfile } = await supabase
            .from('user_profiles')
            .select('premium')
            .eq('stripe_customer_id', subscription.customer)
            .single();
        
        const existingPremium = existingProfile?.premium || {};
        
        // Extract planId from subscription metadata
        const planId = subscription.metadata?.planId || subscription.items.data[0]?.price.id;
        const currentPeriodEnd = subscription.current_period_end 
            ? new Date(subscription.current_period_end * 1000).toISOString() 
            : null;
        
        // Build updated premium object, preserving existing fields
        const updatedPremium = {
            ...existingPremium, // Preserve all existing fields
            isActive: false,
            planId: planId,
            type: planId, // Keep for backwards compatibility
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: subscription.customer,
            status: 'canceled',
            currentPeriodEnd: currentPeriodEnd,
            canceledAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        // Remove premium status
        const { error: updateError } = await supabase
            .from('user_profiles')
            .update({ 
                premium: updatedPremium,
                updated_at: new Date().toISOString()
            })
            .eq('stripe_customer_id', subscription.customer);
        
        if (updateError) {
            console.error('Error updating premium status:', updateError);
        } else {
            console.log(`Removed premium status for customer ${subscription.customer}`);
        }
    } catch (error) {
        console.error('Error handling subscription deleted:', error);
    }
}

async function handlePaymentSucceeded(invoice) {
    try {
        console.log(`Payment succeeded for invoice: ${invoice.id}`);
        
        // Update user's premium status if this is a subscription
        if (invoice.subscription) {
            // First get the subscription to get full details
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
            
            // Get existing premium data to preserve fields
            const { data: existingProfile } = await supabase
                .from('user_profiles')
                .select('premium')
                .eq('stripe_customer_id', subscription.customer)
                .single();
            
            const existingPremium = existingProfile?.premium || {};
            
            const currentPeriodEnd = subscription.current_period_end 
                ? new Date(subscription.current_period_end * 1000).toISOString() 
                : null;
            const currentPeriodStart = subscription.current_period_start 
                ? new Date(subscription.current_period_start * 1000).toISOString() 
                : null;
            
            // Extract planId from subscription metadata
            const planId = subscription.metadata?.planId || subscription.items.data[0]?.price.id;
            
            // Build updated premium object, preserving existing fields
            const updatedPremium = {
                ...existingPremium, // Preserve all existing fields
                isActive: true,
                planId: planId,
                type: planId, // Keep for backwards compatibility
                stripeSubscriptionId: subscription.id,
                stripeCustomerId: subscription.customer,
                status: subscription.status,
                currentPeriodEnd: currentPeriodEnd,
                currentPeriodStart: currentPeriodStart,
                cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
                renewedAt: new Date().toISOString(), // Mark when subscription was renewed
                updatedAt: new Date().toISOString()
            };
            
            const { error: updateError } = await supabase
                .from('user_profiles')
                .update({ 
                    premium: updatedPremium,
                    updated_at: new Date().toISOString()
                })
                .eq('stripe_customer_id', subscription.customer);
            
            if (updateError) {
                console.error('Error updating premium status after payment:', updateError);
            } else {
                console.log(`Updated premium status after successful payment for subscription ${invoice.subscription}`);
            }
        }
    } catch (error) {
        console.error('Error handling payment succeeded:', error);
    }
}

async function handlePaymentFailed(invoice) {
    try {
        console.log(`Payment failed for invoice: ${invoice.id}`);
        
        // Handle failed payment - could send notification, update status, etc.
        if (invoice.subscription) {
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
            
            // Get existing premium data to preserve fields
            const { data: existingProfile } = await supabase
                .from('user_profiles')
                .select('premium')
                .eq('stripe_customer_id', subscription.customer)
                .single();
            
            const existingPremium = existingProfile?.premium || {};
            
            const currentPeriodEnd = subscription.current_period_end 
                ? new Date(subscription.current_period_end * 1000).toISOString() 
                : null;
            const currentPeriodStart = subscription.current_period_start 
                ? new Date(subscription.current_period_start * 1000).toISOString() 
                : null;
            
            // Extract planId from subscription metadata
            const planId = subscription.metadata?.planId || subscription.items.data[0]?.price.id;
            
            // Build updated premium object, preserving existing fields
            const updatedPremium = {
                ...existingPremium, // Preserve all existing fields
                isActive: false, // Set to false on payment failure
                planId: planId,
                type: planId, // Keep for backwards compatibility
                stripeSubscriptionId: subscription.id,
                stripeCustomerId: subscription.customer,
                status: 'past_due',
                currentPeriodEnd: currentPeriodEnd,
                currentPeriodStart: currentPeriodStart,
                updatedAt: new Date().toISOString()
            };
            
            const { error: updateError } = await supabase
                .from('user_profiles')
                .update({ 
                    premium: updatedPremium,
                    updated_at: new Date().toISOString()
                })
                .eq('stripe_customer_id', subscription.customer);
            
            if (updateError) {
                console.error('Error updating subscription status after failed payment:', updateError);
            } else {
                console.log(`Updated subscription status to past_due for subscription ${invoice.subscription}`);
            }
        }
    } catch (error) {
        console.error('Error handling payment failed:', error);
    }
}

module.exports = async (req, res) => {
    // SECURITY: Environment-aware CORS configuration
    // Production: Only allow specific production domains
    // Development: Allow localhost for local testing
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';
    
    const productionOrigins = [
        'https://stripe.webcap.media',
        'https://webcap.media',
        'https://wiznote.app',
    ];
    
    const developmentOrigins = [
        'http://localhost:8081',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:8081',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001'
    ];
    
    const allowedOrigins = isDevelopment 
        ? [...productionOrigins, ...developmentOrigins]
        : productionOrigins;
    
    const origin = req.headers.origin;
    let allowedOrigin = null;
    
    if (origin && allowedOrigins.includes(origin)) {
        allowedOrigin = origin;
    } else if (isDevelopment && origin) {
        // In development, log but allow (for debugging)
        console.warn(`[SECURITY] CORS: Unallowed origin attempted: ${origin}`);
        allowedOrigin = origin; // Allow in dev for easier testing
    } else {
        // Production: Default to primary production domain
        allowedOrigin = 'https://stripe.webcap.media';
    }
    
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Stripe-Signature');
    res.setHeader('Access-Control-Allow-Credentials', 'false'); // Webhooks don't need credentials
    res.setHeader('Vary', 'Origin'); // Important for CORS caching
    
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
        const signature = req.headers['stripe-signature'];
        if (!signature) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing Stripe-Signature header' }));
            return;
        }
        
        // Get the raw body from req.rawBody (already read by server.js)
        // We need the raw unparsed body for webhook signature verification
        const rawBody = req.rawBody || req.body;
        
        if (!rawBody) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No request body' }));
            return;
        }
        
        // Verify webhook signature
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) {
            console.error('Webhook secret is required for signature verification');
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Webhook configuration error' }));
            return;
        }
        
        let event;
        try {
            event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
        } catch (err) {
            console.error('Webhook signature verification failed:', err.message);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid signature' }));
            return;
        }
        
        // Handle the webhook event
        await handleWebhookEvent(event);
        
        // Return success
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true }));
        
    } catch (error) {
        console.error('Webhook handling error:', error);
        
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
    }
};
