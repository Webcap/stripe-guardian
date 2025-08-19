// Vercel API route for Stripe webhooks
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2025-07-30.basil'
});

// Initialize Supabase
const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Handle webhook events
async function handleWebhookEvent(event) {
    try {
        console.log('Handling webhook event:', event.type);
        
        switch (event.type) {
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

// Customer sync handlers
async function handleCustomerCreated(customer) {
    try {
        console.log(`Syncing new customer: ${customer.id} (${customer.email})`);
        
        // Check if user exists in Supabase
        const { data: existingUser, error: userError } = await supabase
            .from('user_profiles')
            .select('id, email, stripe_customer_id')
            .eq('email', customer.email)
            .single();
        
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
        } else {
            // Create new user profile if doesn't exist
            const { error: insertError } = await supabase
                .from('user_profiles')
                .insert({
                    email: customer.email,
                    stripe_customer_id: customer.id,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
            
            if (insertError) {
                console.error('Error creating new user profile:', insertError);
            } else {
                console.log(`Created new user profile for Stripe customer ${customer.id}`);
            }
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
            .eq('email', customer.email);
        
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
        
        // Update user's premium status
        const { error: updateError } = await supabase
            .from('user_profiles')
            .update({ 
                is_premium: true,
                subscription_id: subscription.id,
                subscription_status: subscription.status,
                updated_at: new Date().toISOString()
            })
            .eq('stripe_customer_id', subscription.customer);
        
        if (updateError) {
            console.error('Error updating premium status:', updateError);
        } else {
            console.log(`Updated premium status for customer ${subscription.customer}`);
        }
    } catch (error) {
        console.error('Error handling subscription created:', error);
    }
}

async function handleSubscriptionUpdated(subscription) {
    try {
        console.log(`Subscription updated: ${subscription.id} for customer ${subscription.customer}`);
        
        // Update subscription status
        const { error: updateError } = await supabase
            .from('user_profiles')
            .update({ 
                subscription_status: subscription.status,
                updated_at: new Date().toISOString()
            })
            .eq('stripe_customer_id', subscription.customer);
        
        if (updateError) {
            console.error('Error updating subscription status:', updateError);
        } else {
            console.log(`Updated subscription status for customer ${subscription.customer}`);
        }
    } catch (error) {
        console.error('Error handling subscription updated:', error);
    }
}

async function handleSubscriptionDeleted(subscription) {
    try {
        console.log(`Subscription deleted: ${subscription.id} for customer ${subscription.customer}`);
        
        // Remove premium status
        const { error: updateError } = await supabase
            .from('user_profiles')
            .update({ 
                is_premium: false,
                subscription_id: null,
                subscription_status: 'canceled',
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
            const { error: updateError } = await supabase
                .from('user_profiles')
                .update({ 
                    is_premium: true,
                    updated_at: new Date().toISOString()
                })
                .eq('subscription_id', invoice.subscription);
            
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
            const { error: updateError } = await supabase
                .from('user_profiles')
                .update({ 
                    subscription_status: 'past_due',
                    updated_at: new Date().toISOString()
                })
                .eq('subscription_id', invoice.subscription);
            
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

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', 'https://stripe.webcap.media');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Stripe-Signature');
    
    // Handle preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    
    try {
        const signature = req.headers['stripe-signature'];
        if (!signature) {
            return res.status(400).json({ error: 'Missing Stripe-Signature header' });
        }
        
        // Get the raw body from the request
        let rawBody = '';
        req.on('data', (chunk) => {
            rawBody += chunk.toString();
        });
        
        return new Promise((resolve) => {
            req.on('end', async () => {
                if (!rawBody) {
                    return resolve(res.status(400).json({ error: 'No request body' }));
                }
        
        // Verify webhook signature
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) {
            console.error('Webhook secret is required for signature verification');
            return res.status(500).json({ error: 'Webhook configuration error' });
        }
        
        let event;
        try {
            event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
        } catch (err) {
            console.error('Webhook signature verification failed:', err.message);
            return res.status(400).json({ error: 'Invalid signature' });
        }
        
        // Handle the webhook event
        await handleWebhookEvent(event);
        
                // Return success
                resolve(res.status(200).json({ received: true }));
            });
        });
        
    } catch (error) {
        console.error('Webhook handling error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

// Configure body parsing for raw data (needed for webhook signature verification)
export const config = {
    api: {
        bodyParser: false,
    },
};
