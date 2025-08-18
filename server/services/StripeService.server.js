"use strict";
// Stripe Service Foundation - Server Version
// Phase 1: Foundation - Stripe Integration
// This version is for server-side use only (webhooks, admin operations)
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeService = exports.StripeService = void 0;
const stripe_1 = __importDefault(require("stripe"));
const supabase_1 = require("../lib/supabase");
class StripeService {
    constructor() {
        this.initialized = false;
        this.apiKey = process.env.STRIPE_SECRET_KEY || '';
        this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
        // Defer any warnings or errors to ensureInitialized so merely importing
        // this module in a web environment doesn't spam the console.
    }
    static getInstance() {
        if (!StripeService.instance) {
            StripeService.instance = new StripeService();
        }
        return StripeService.instance;
    }
    async ensureInitialized() {
        if (this.initialized) {
            return;
        }
        if (!this.apiKey) {
            throw new Error('STRIPE_SECRET_KEY is required for Stripe integration');
        }
        // Webhook secret is only required for webhook verification paths; don't block other operations
        this.initializeStripe();
        this.initialized = true;
    }
    initializeStripe() {
        try {
            console.log('StripeService: Initializing Stripe SDK...');
            this.stripe = new stripe_1.default(this.apiKey, {
                // Use a stable GA API version
                apiVersion: '2025-07-30.basil',
                typescript: true,
            });
            console.log('StripeService: Stripe SDK initialized successfully');
        }
        catch (error) {
            console.error('StripeService: Failed to initialize Stripe SDK:', error);
            throw error;
        }
    }
    // Create or update Stripe product
    async syncProduct(plan) {
        try {
            await this.ensureInitialized();
            console.log(`StripeService: Syncing product for plan ${plan.id} (${plan.name})`);
            let product = null;
            // 1) Try to use existing product by stored ID
            if (plan.stripeProductId) {
                try {
                    product = await this.stripe.products.retrieve(plan.stripeProductId);
                }
                catch (e) {
                    console.warn('StripeService: Stored product ID not found in Stripe, will search by metadata.planId');
                    product = null;
                }
            }
            // 2) If not found, search by metadata.planId to avoid duplicates
            if (!product) {
                try {
                    // Use search API if available
                    const search = await this.stripe.products.search({
                        query: `metadata['planId']:'${plan.id}'`,
                    });
                    if (search.data && search.data.length > 0) {
                        product = search.data[0];
                        console.log(`StripeService: Found existing product by metadata for plan ${plan.id}: ${product.id}`);
                    }
                }
                catch (e) {
                    console.warn('StripeService: Product search not available; skipping search');
                }
            }
            // 3) Create or update product
            if (product) {
                product = await this.stripe.products.update(product.id, {
                    name: plan.name,
                    description: plan.description,
                    metadata: {
                        planId: plan.id,
                        planType: plan.type,
                        planTier: plan.tier,
                    },
                });
            }
            else {
                product = await this.stripe.products.create({
                    name: plan.name,
                    description: plan.description,
                    metadata: {
                        planId: plan.id,
                        planType: plan.type,
                        planTier: plan.tier,
                    },
                });
            }
            // 4) Sync price for the product
            const priceId = await this.syncPrice(product.id, plan);
            console.log(`StripeService: Successfully synced product ${product.id} and price ${priceId}`);
            return { productId: product.id, priceId };
        }
        catch (error) {
            console.error('StripeService: Error syncing product:', error);
            throw error;
        }
    }
    // Sync price for product
    async syncPrice(productId, plan) {
        try {
            await this.ensureInitialized();
            console.log(`StripeService: Syncing price for product ${productId}`);
            // Check if we have an existing price to reuse
            if (plan.stripePriceId) {
                try {
                    const existingPrice = await this.stripe.prices.retrieve(plan.stripePriceId);
                    if (existingPrice.active && existingPrice.unit_amount === plan.price * 100) {
                        console.log(`StripeService: Reusing existing price ${existingPrice.id}`);
                        return existingPrice.id;
                    }
                }
                catch (e) {
                    console.warn('StripeService: Stored price ID not found, will create new price');
                }
            }
            // Deactivate old price if it exists
            if (plan.stripePriceId) {
                try {
                    await this.stripe.prices.update(plan.stripePriceId, { active: false });
                    console.log(`StripeService: Deactivating old price ${plan.stripePriceId}`);
                }
                catch (e) {
                    console.warn('StripeService: Could not deactivate old price:', e);
                }
            }
            // Create new price
            const priceData = {
                product: productId,
                unit_amount: Math.round(plan.price * 100), // Convert to cents
                currency: 'usd',
                recurring: {
                    interval: plan.billingCycle === 'monthly' ? 'month' : 'year',
                },
                metadata: {
                    planId: plan.id,
                    planType: plan.type,
                    planTier: plan.tier,
                },
            };
            console.log(`StripeService: Creating new price with data:`, priceData);
            const price = await this.stripe.prices.create(priceData);
            console.log(`StripeService: Successfully created price ${price.id}`);
            return price.id;
        }
        catch (error) {
            console.error('StripeService: Error syncing price:', error);
            throw error;
        }
    }
    // Delete product
    async deleteProduct(plan) {
        try {
            await this.ensureInitialized();
            if (!plan.stripeProductId) {
                console.log(`StripeService: No Stripe product ID for plan ${plan.id}, skipping deletion`);
                return;
            }
            console.log(`StripeService: Deleting product for plan ${plan.id}`);
            // Deactivate all prices for the product
            const prices = await this.stripe.prices.list({ product: plan.stripeProductId });
            for (const price of prices.data) {
                if (price.active) {
                    await this.stripe.prices.update(price.id, { active: false });
                }
            }
            console.log(`StripeService: Deactivating all prices for product ${plan.stripeProductId}`);
            // Archive the product
            await this.stripe.products.update(plan.stripeProductId, { active: false });
            console.log(`StripeService: Archiving product ${plan.stripeProductId}`);
        }
        catch (error) {
            console.error('StripeService: Error deleting product:', error);
            throw error;
        }
    }
    // Handle webhook events
    async handleWebhook(event) {
        try {
            await this.ensureInitialized();
            console.log('StripeService: Handling webhook event:', event.type);
            switch (event.type) {
                case 'product.updated':
                    await this.handleProductUpdate(event.data.object.id, event.data.object.metadata?.planId);
                    break;
                case 'price.updated':
                    await this.handlePriceUpdate(event.data.object.id, event.data.object.metadata?.planId);
                    break;
                case 'customer.subscription.updated':
                    await this.handleSubscriptionUpdate(event.data.object.id, event.data.object.metadata?.planId);
                    break;
                default:
                    console.log(`StripeService: Unhandled webhook event type: ${event.type}`);
            }
        }
        catch (error) {
            console.error('StripeService: Error handling webhook:', error);
            throw error;
        }
    }
    // Verify webhook signature
    async verifyWebhookSignature(rawBody, signature) {
        try {
            await this.ensureInitialized();
            if (!this.webhookSecret) {
                throw new Error('Webhook secret is required for signature verification');
            }
            return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
        }
        catch (error) {
            console.error('StripeService: Error verifying webhook signature:', error);
            throw error;
        }
    }
    // Get sync status
    async getSyncStatus(plan) {
        try {
            await this.ensureInitialized();
            console.log(`StripeService: Getting sync status for plan ${plan.id}`);
            const result = {
                planId: plan.id,
                isSynced: false,
                stripeProductId: null,
                stripePriceId: null,
                lastSync: null,
                errors: [],
            };
            if (!plan.stripeProductId) {
                result.errors.push('No Stripe product ID found');
                return result;
            }
            try {
                const product = await this.stripe.products.retrieve(plan.stripeProductId);
                if (product.active) {
                    result.stripeProductId = product.id;
                    result.isSynced = true;
                    result.lastSync = new Date().toISOString();
                    // Check if we have an active price
                    if (plan.stripePriceId) {
                        try {
                            const price = await this.stripe.prices.retrieve(plan.stripePriceId);
                            if (price.active) {
                                result.stripePriceId = price.id;
                            }
                            else {
                                result.errors.push('Stripe price is inactive');
                            }
                        }
                        catch (e) {
                            result.errors.push('Could not retrieve Stripe price');
                        }
                    }
                }
                else {
                    result.errors.push('Stripe product is inactive');
                }
            }
            catch (e) {
                result.errors.push('Could not retrieve Stripe product');
            }
            return result;
        }
        catch (error) {
            console.error('StripeService: Error getting sync status:', error);
            throw error;
        }
    }
    // Handle product updates
    async handleProductUpdate(productId, planId) {
        try {
            await this.ensureInitialized();
            if (!planId) {
                console.warn('StripeService: No plan ID in product metadata, skipping update');
                return;
            }
            // Update plan in database if needed
            const { error } = await supabase_1.supabase
                .from('enhanced_plans')
                .update({
                updated_at: new Date().toISOString(),
                stripe_last_sync: new Date().toISOString()
            })
                .eq('id', planId);
            if (error) {
                console.error('StripeService: Error updating plan from Stripe:', error);
            }
        }
        catch (error) {
            console.error('StripeService: Error handling product update:', error);
        }
    }
    // Handle price updates
    async handlePriceUpdate(priceId, planId) {
        try {
            await this.ensureInitialized();
            if (!planId) {
                console.warn('StripeService: No plan ID in price metadata, skipping update');
                return;
            }
            // Update plan in database if needed
            const { error } = await supabase_1.supabase
                .from('enhanced_plans')
                .update({
                updated_at: new Date().toISOString(),
                stripe_last_sync: new Date().toISOString()
            })
                .eq('id', planId);
            if (error) {
                console.error('StripeService: Error updating plan from Stripe:', error);
            }
            console.log(`StripeService: Price updated for plan ${planId}`);
        }
        catch (error) {
            console.error('StripeService: Error handling price update:', error);
        }
    }
    // Handle subscription updates
    async handleSubscriptionUpdate(subscriptionId, planId) {
        try {
            await this.ensureInitialized();
            if (!planId) {
                console.warn('StripeService: No plan ID in subscription metadata, skipping update');
                return;
            }
            // Update plan in database if needed
            const { error } = await supabase_1.supabase
                .from('enhanced_plans')
                .update({
                updated_at: new Date().toISOString(),
                stripe_last_sync: new Date().toISOString()
            })
                .eq('id', planId);
            if (error) {
                console.error('StripeService: Error updating plan from Stripe:', error);
            }
        }
        catch (error) {
            console.error('StripeService: Error handling subscription update:', error);
        }
    }
    // Update plan from Stripe
    async updatePlanFromStripe(planId) {
        try {
            await this.ensureInitialized();
            // This would fetch the plan from Stripe and update the database
            // Implementation depends on your specific needs
            console.log(`StripeService: Updating plan ${planId} from Stripe`);
        }
        catch (error) {
            console.error('StripeService: Error updating plan from Stripe:', error);
            throw error;
        }
    }
    // Get or create customer
    async getOrCreateCustomer(userId, email) {
        try {
            await this.ensureInitialized();
            console.log(`StripeService: Getting or creating customer for user ${userId}`);
            // First, check if user already has a Stripe customer ID
            const { data: userData, error: userError } = await supabase_1.supabase
                .from('user_profiles')
                .select('stripe_customer_id')
                .eq('id', userId)
                .single();
            if (userError) {
                console.error('StripeService: Error fetching user data:', userError);
                throw userError;
            }
            if (userData?.stripe_customer_id) {
                console.log(`StripeService: User ${userId} already has Stripe customer ID: ${userData.stripe_customer_id}`);
                return userData.stripe_customer_id;
            }
            // Create new Stripe customer
            console.log(`StripeService: Creating new Stripe customer for user ${userId}`);
            const customer = await this.stripe.customers.create({
                email,
                metadata: {
                    userId,
                },
            });
            console.log(`StripeService: Created Stripe customer ${customer.id} for user ${userId}`);
            // Update user profile with Stripe customer ID
            const { error: updateError } = await supabase_1.supabase
                .from('user_profiles')
                .update({
                stripe_customer_id: customer.id,
                updated_at: new Date().toISOString()
            })
                .eq('id', userId);
            if (updateError) {
                console.error('StripeService: Error updating user with Stripe customer ID:', updateError);
                console.error('StripeService: Update details:', {
                    userId,
                    customerId: customer.id,
                    error: updateError
                });
                // Check if user profile exists
                const { data: profileCheck, error: profileError } = await supabase_1.supabase
                    .from('user_profiles')
                    .select('id')
                    .eq('id', userId)
                    .single();
                if (profileError) {
                    console.error('StripeService: Cannot find user profile:', profileError);
                }
                else {
                    console.log('StripeService: User profile exists:', profileCheck);
                }
            }
            else {
                console.log(`StripeService: Successfully updated user ${userId} with Stripe customer ID ${customer.id}`);
            }
            return customer.id;
        }
        catch (error) {
            console.error('StripeService: Error getting or creating customer:', error);
            throw error;
        }
    }
    // Create checkout session
    async createCheckoutSession(customerId, priceId, successUrl, cancelUrl) {
        try {
            await this.ensureInitialized();
            console.log(`StripeService: Creating checkout session for customer ${customerId}, price ${priceId}`);
            const session = await this.stripe.checkout.sessions.create({
                customer: customerId,
                payment_method_types: ['card'],
                line_items: [
                    {
                        price: priceId,
                        quantity: 1,
                    },
                ],
                mode: 'subscription',
                success_url: successUrl,
                cancel_url: cancelUrl,
                metadata: {
                    customerId,
                    priceId,
                },
            });
            return session.url || '';
        }
        catch (error) {
            console.error('StripeService: Error creating checkout session:', error);
            throw error;
        }
    }
    // Get subscription
    async getSubscription(subscriptionId) {
        try {
            await this.ensureInitialized();
            console.log(`StripeService: Getting subscription ${subscriptionId}`);
            return await this.stripe.subscriptions.retrieve(subscriptionId);
        }
        catch (error) {
            console.error('StripeService: Error retrieving subscription:', error);
            throw error;
        }
    }
    // Get checkout session
    async getCheckoutSession(sessionId) {
        try {
            await this.ensureInitialized();
            console.log(`StripeService: Getting checkout session ${sessionId}`);
            return await this.stripe.checkout.sessions.retrieve(sessionId);
        }
        catch (error) {
            console.error('StripeService: Error retrieving checkout session:', error);
            throw error;
        }
    }
    // Update user premium status
    async updateUserPremiumStatus(customerId, isPremium) {
        try {
            await this.ensureInitialized();
            console.log(`StripeService: Updating premium status for customer ${customerId} to ${isPremium}`);
            // Find user by Stripe customer ID
            const { data: userProfile, error: findError } = await supabase_1.supabase
                .from('user_profiles')
                .select('id, premium')
                .eq('stripe_customer_id', customerId)
                .single();
            if (findError) {
                console.error('StripeService: Error finding user by customer ID:', findError);
                return { error: findError };
            }
            if (!userProfile) {
                console.error('StripeService: No user profile found for customer ID:', customerId);
                return { error: new Error('User profile not found') };
            }
            // Update premium status
            const { error: updateError } = await supabase_1.supabase
                .from('user_profiles')
                .update({
                premium: isPremium,
                updated_at: new Date().toISOString()
            })
                .eq('id', userProfile.id);
            if (updateError) {
                console.error('StripeService: Error updating premium status:', updateError);
                return { error: updateError };
            }
            console.log(`StripeService: Successfully updated premium status for user ${userProfile.id}`);
            return { error: null };
        }
        catch (error) {
            console.error('StripeService: Error updating user premium status:', error);
            return { error };
        }
    }
    // Cancel subscription
    async cancelSubscription(subscriptionId) {
        try {
            await this.ensureInitialized();
            console.log(`StripeService: Canceling subscription ${subscriptionId}`);
            await this.stripe.subscriptions.cancel(subscriptionId);
        }
        catch (error) {
            console.error('StripeService: Error canceling subscription:', error);
            throw error;
        }
    }
    // Getter for Stripe instance
    getStripeInstance() {
        if (!this.initialized) {
            throw new Error('StripeService not initialized');
        }
        return this.stripe;
    }
}
exports.StripeService = StripeService;
exports.stripeService = StripeService.getInstance();
