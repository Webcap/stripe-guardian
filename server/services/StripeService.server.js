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
    
    // =====================================================
    // PROMOTION METHODS
    // =====================================================
    
    /**
     * Create a Stripe coupon for a promotion
     * @param {Object} promotionData - Promotion configuration
     * @returns {Promise<Object>} Created coupon with id
     */
    async createPromotionCoupon(promotionData) {
        try {
            await this.ensureInitialized();
            console.log('StripeService: Creating promotion coupon:', promotionData.name);
            
            const couponData = {
                name: promotionData.name,
                metadata: {
                    promotionId: promotionData.id,
                    source: 'wiznote_promotion_system'
                }
            };
            
            // Set discount based on type
            if (promotionData.discountType === 'percentage') {
                couponData.percent_off = promotionData.discountValue;
                couponData.duration = promotionData.duration || 'once';
            } else if (promotionData.discountType === 'fixed_amount') {
                couponData.amount_off = Math.round(promotionData.discountValue * 100); // Convert to cents
                couponData.currency = promotionData.currency || 'usd';
                couponData.duration = promotionData.duration || 'once';
            }
            
            // Set duration details
            if (promotionData.durationInMonths && couponData.duration === 'repeating') {
                couponData.duration_in_months = promotionData.durationInMonths;
            }
            
            // Set expiration if provided
            if (promotionData.endDate) {
                const endDate = new Date(promotionData.endDate);
                couponData.redeem_by = Math.floor(endDate.getTime() / 1000);
            }
            
            // Set max redemptions if provided
            if (promotionData.maxRedemptions) {
                couponData.max_redemptions = promotionData.maxRedemptions;
            }
            
            const coupon = await this.stripe.coupons.create(couponData);
            console.log(`StripeService: Created coupon ${coupon.id} for promotion ${promotionData.id}`);
            
            return { couponId: coupon.id, coupon };
        } catch (error) {
            console.error('StripeService: Error creating promotion coupon:', error);
            throw error;
        }
    }
    
    /**
     * Create a promotion code (user-friendly code string) for a coupon
     * @param {string} couponId - Stripe coupon ID
     * @param {string} code - Human-readable code (e.g., "SUMMER30")
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Created promotion code
     */
    async createPromotionCode(couponId, code, options = {}) {
        try {
            await this.ensureInitialized();
            console.log(`StripeService: Creating promotion code "${code}" for coupon ${couponId}`);
            
            const promoCodeData = {
                coupon: couponId,
                code: code.toUpperCase(),
                active: options.active !== false,
                metadata: options.metadata || {}
            };
            
            if (options.maxRedemptions) {
                promoCodeData.max_redemptions = options.maxRedemptions;
            }
            
            if (options.expiresAt) {
                const expiresDate = new Date(options.expiresAt);
                promoCodeData.expires_at = Math.floor(expiresDate.getTime() / 1000);
            }
            
            const promoCode = await this.stripe.promotionCodes.create(promoCodeData);
            console.log(`StripeService: Created promotion code ${promoCode.id}`);
            
            return { promotionCodeId: promoCode.id, promotionCode: promoCode };
        } catch (error) {
            console.error('StripeService: Error creating promotion code:', error);
            throw error;
        }
    }
    
    /**
     * Create a discounted price for a plan (alternative to coupons)
     * @param {string} productId - Stripe product ID
     * @param {Object} plan - Plan configuration
     * @param {number} discountValue - Discount value (percentage or fixed amount)
     * @param {string} discountType - 'percentage' or 'fixed_amount'
     * @returns {Promise<string>} Created price ID
     */
    async createDiscountedPrice(productId, plan, discountValue, discountType = 'percentage') {
        try {
            await this.ensureInitialized();
            console.log(`StripeService: Creating discounted price for product ${productId}`);
            
            let discountedAmount;
            
            if (discountType === 'percentage') {
                discountedAmount = plan.price * (1 - discountValue / 100);
            } else {
                discountedAmount = Math.max(0, plan.price - discountValue);
            }
            
            const priceData = {
                product: productId,
                unit_amount: Math.round(discountedAmount * 100), // Convert to cents
                currency: 'usd',
                recurring: {
                    interval: plan.interval || 'month',
                    interval_count: plan.intervalCount || 1,
                },
                metadata: {
                    planId: plan.id,
                    planType: plan.type,
                    isPromotionalPrice: 'true',
                    originalPrice: plan.price.toString(),
                    discountValue: discountValue.toString(),
                    discountType: discountType
                },
            };
            
            const price = await this.stripe.prices.create(priceData);
            console.log(`StripeService: Created discounted price ${price.id}`);
            
            return price.id;
        } catch (error) {
            console.error('StripeService: Error creating discounted price:', error);
            throw error;
        }
    }
    
    /**
     * Validate a coupon or promotion code
     * @param {string} code - Coupon ID or promotion code
     * @returns {Promise<Object>} Validation result with coupon details
     */
    async validateCoupon(code) {
        try {
            await this.ensureInitialized();
            console.log(`StripeService: Validating coupon/promo code: ${code}`);
            
            let coupon = null;
            let promoCode = null;
            
            // Try as coupon ID first
            try {
                coupon = await this.stripe.coupons.retrieve(code);
            } catch (e) {
                // Not a coupon ID, try as promotion code
                try {
                    const promoCodes = await this.stripe.promotionCodes.list({
                        code: code.toUpperCase(),
                        limit: 1
                    });
                    
                    if (promoCodes.data && promoCodes.data.length > 0) {
                        promoCode = promoCodes.data[0];
                        coupon = await this.stripe.coupons.retrieve(promoCode.coupon);
                    }
                } catch (promoError) {
                    console.warn('StripeService: Code not found as coupon or promotion code');
                    return { 
                        valid: false, 
                        error: 'Invalid promotion code' 
                    };
                }
            }
            
            if (!coupon) {
                return { 
                    valid: false, 
                    error: 'Coupon not found' 
                };
            }
            
            // Check if coupon is valid
            if (!coupon.valid) {
                return { 
                    valid: false, 
                    error: 'Coupon is no longer valid' 
                };
            }
            
            // Check if expired
            if (coupon.redeem_by && coupon.redeem_by < Math.floor(Date.now() / 1000)) {
                return { 
                    valid: false, 
                    error: 'Coupon has expired' 
                };
            }
            
            // Check max redemptions
            if (coupon.max_redemptions && coupon.times_redeemed >= coupon.max_redemptions) {
                return { 
                    valid: false, 
                    error: 'Coupon redemption limit reached' 
                };
            }
            
            // Check promotion code specific validations
            if (promoCode) {
                if (!promoCode.active) {
                    return { 
                        valid: false, 
                        error: 'Promotion code is inactive' 
                    };
                }
                
                if (promoCode.expires_at && promoCode.expires_at < Math.floor(Date.now() / 1000)) {
                    return { 
                        valid: false, 
                        error: 'Promotion code has expired' 
                    };
                }
                
                if (promoCode.max_redemptions && promoCode.times_redeemed >= promoCode.max_redemptions) {
                    return { 
                        valid: false, 
                        error: 'Promotion code redemption limit reached' 
                    };
                }
            }
            
            console.log(`StripeService: Coupon ${code} is valid`);
            return { 
                valid: true, 
                coupon,
                promoCode,
                discountType: coupon.percent_off ? 'percentage' : 'fixed_amount',
                discountValue: coupon.percent_off || (coupon.amount_off / 100)
            };
        } catch (error) {
            console.error('StripeService: Error validating coupon:', error);
            return { 
                valid: false, 
                error: 'Error validating coupon' 
            };
        }
    }
    
    /**
     * Apply a coupon to a checkout session
     * @param {Object} sessionParams - Checkout session parameters
     * @param {string} couponId - Coupon or promotion code ID
     * @returns {Object} Updated session params
     */
    applyCouponToCheckout(sessionParams, couponId) {
        console.log(`StripeService: Applying coupon ${couponId} to checkout session`);
        
        // Add coupon/promo code to session
        sessionParams.discounts = [{
            coupon: couponId
        }];
        
        // Alternatively, if it's a promotion code string, use allow_promotion_codes
        // sessionParams.allow_promotion_codes = true;
        
        return sessionParams;
    }
    
    /**
     * Retrieve a coupon by ID
     * @param {string} couponId - Coupon ID
     * @returns {Promise<Object>} Coupon object
     */
    async getCoupon(couponId) {
        try {
            await this.ensureInitialized();
            return await this.stripe.coupons.retrieve(couponId);
        } catch (error) {
            console.error('StripeService: Error retrieving coupon:', error);
            throw error;
        }
    }
    
    /**
     * Deactivate/delete a coupon
     * @param {string} couponId - Coupon ID to deactivate
     * @returns {Promise<boolean>} Success status
     */
    async deactivateCoupon(couponId) {
        try {
            await this.ensureInitialized();
            console.log(`StripeService: Deactivating coupon ${couponId}`);
            await this.stripe.coupons.del(couponId);
            return true;
        } catch (error) {
            console.error('StripeService: Error deactivating coupon:', error);
            throw error;
        }
    }
}
exports.StripeService = StripeService;
exports.stripeService = StripeService.getInstance();
