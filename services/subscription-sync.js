/**
 * Subscription Sync Service
 * Automatically checks and syncs subscription statuses from Stripe to Supabase
 */

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

class SubscriptionSyncService {
  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2024-06-20'
    });
    
    this.supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
    
    this.syncInterval = null;
    this.isRunning = false;
    this.lastSyncTime = null;
    this.syncCount = 0;
    
    // Configuration
    this.config = {
      syncIntervalMs: 60 * 60 * 1000, // 60 minutes (1 hour)
      maxSubscriptionsPerSync: 100,
    };
  }

  /**
   * Start the automatic subscription sync
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️  Subscription sync already running');
      return;
    }

    this.isRunning = true;
    console.log('🔄 Starting automatic subscription sync...');
    console.log(`📊 Sync interval: ${this.config.syncIntervalMs / 1000 / 60} minutes`);

    // Run initial sync
    this.performSync().catch(err => {
      console.error('❌ Initial sync failed:', err.message);
    });

    // Set up periodic sync
    this.syncInterval = setInterval(() => {
      this.performSync().catch(err => {
        console.error('❌ Periodic sync failed:', err.message);
      });
    }, this.config.syncIntervalMs);
  }

  /**
   * Stop the automatic subscription sync
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Stopping subscription sync...');
    this.isRunning = false;

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Perform a full subscription sync
   */
  async performSync() {
    const syncStart = Date.now();
    this.syncCount++;
    
    console.log(`\n🔄 [Sync #${this.syncCount}] Starting subscription sync at ${new Date().toISOString()}`);

    try {
      // Step 1: Sync active subscriptions from Stripe
      const activeCount = await this.syncActiveSubscriptions();
      
      // Step 2: Check for expired subscriptions in database
      const expiredCount = await this.checkExpiredSubscriptions();
      
      // Step 3: Sync canceled subscriptions
      const canceledCount = await this.syncCanceledSubscriptions();

      const syncDuration = Date.now() - syncStart;
      this.lastSyncTime = new Date();

      console.log(`✅ [Sync #${this.syncCount}] Completed in ${syncDuration}ms`);
      console.log(`   📈 Active: ${activeCount} | 📉 Expired: ${expiredCount} | ❌ Canceled: ${canceledCount}`);
      
      return {
        success: true,
        activeCount,
        expiredCount,
        canceledCount,
        duration: syncDuration,
      };
    } catch (error) {
      console.error(`❌ [Sync #${this.syncCount}] Failed:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Sync active subscriptions from Stripe to database
   */
  async syncActiveSubscriptions() {
    try {
      // Get active subscriptions from Stripe
      const subscriptions = await this.stripe.subscriptions.list({
        status: 'active',
        limit: this.config.maxSubscriptionsPerSync,
        expand: ['data.customer'],
      });

      console.log(`   🔍 Found ${subscriptions.data.length} active subscriptions in Stripe`);

      let syncedCount = 0;

      for (const subscription of subscriptions.data) {
        try {
          const customerId = typeof subscription.customer === 'string' 
            ? subscription.customer 
            : subscription.customer.id;

          // Find user by Stripe customer ID
          const { data: users, error: userError } = await this.supabase
            .from('user_profiles')
            .select('id, premium')
            .eq('stripe_customer_id', customerId);

          if (userError) {
            console.error(`   ⚠️  Error fetching user for customer ${customerId}:`, userError.message);
            continue;
          }

          if (!users || users.length === 0) {
            console.log(`   ⚠️  No user found for Stripe customer ${customerId}`);
            continue;
          }

          const user = users[0];
          const currentPremium = user.premium || {};

          // Check if update is needed
          const needsUpdate = 
            currentPremium.stripeSubscriptionId !== subscription.id ||
            currentPremium.status !== subscription.status ||
            !currentPremium.isActive;

          if (needsUpdate) {
            const planId = subscription.metadata?.planId || subscription.items.data[0]?.price.id;
            const currentPeriodEnd = subscription.current_period_end 
              ? new Date(subscription.current_period_end * 1000).toISOString() 
              : null;
            const currentPeriodStart = subscription.current_period_start 
              ? new Date(subscription.current_period_start * 1000).toISOString() 
              : null;

            const { error: updateError } = await this.supabase
              .from('user_profiles')
              .update({
                premium: {
                  isActive: true,
                  planId: planId,
                  stripeSubscriptionId: subscription.id,
                  stripeCustomerId: customerId,
                  status: subscription.status,
                  currentPeriodEnd: currentPeriodEnd,
                  currentPeriodStart: currentPeriodStart,
                  updatedAt: new Date().toISOString(),
                },
                updated_at: new Date().toISOString(),
              })
              .eq('id', user.id);

            if (updateError) {
              console.error(`   ❌ Failed to update user ${user.id}:`, updateError.message);
            } else {
              syncedCount++;
              console.log(`   ✅ Synced subscription ${subscription.id} for user ${user.id}`);
            }
          }
        } catch (error) {
          console.error(`   ❌ Error processing subscription ${subscription.id}:`, error.message);
        }
      }

      return syncedCount;
    } catch (error) {
      console.error('   ❌ Error syncing active subscriptions:', error.message);
      return 0;
    }
  }

  /**
   * Check for and deactivate expired subscriptions
   */
  async checkExpiredSubscriptions() {
    try {
      const now = new Date().toISOString();

      // Find users with expired premium periods
      const { data: users, error: queryError } = await this.supabase
        .from('user_profiles')
        .select('id, premium, stripe_customer_id')
        .not('premium', 'is', null);

      if (queryError) {
        console.error('   ❌ Error querying for expired subscriptions:', queryError.message);
        return 0;
      }

      let expiredCount = 0;

      for (const user of users || []) {
        if (!user.premium || !user.premium.isActive) {
          continue;
        }

        const currentPeriodEnd = user.premium.currentPeriodEnd;
        
        if (currentPeriodEnd && currentPeriodEnd < now) {
          // Period has expired, verify with Stripe
          if (user.premium.stripeSubscriptionId) {
            try {
              const subscription = await this.stripe.subscriptions.retrieve(
                user.premium.stripeSubscriptionId
              );

              // Only deactivate if Stripe confirms it's not active
              if (!['active', 'trialing'].includes(subscription.status)) {
                const { error: updateError } = await this.supabase
                  .from('user_profiles')
                  .update({
                    premium: {
                      ...user.premium,
                      isActive: false,
                      status: subscription.status,
                      updatedAt: new Date().toISOString(),
                    },
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', user.id);

                if (!updateError) {
                  expiredCount++;
                  console.log(`   ⏰ Deactivated expired subscription for user ${user.id}`);
                }
              }
            } catch (stripeError) {
              console.error(`   ⚠️  Could not verify subscription ${user.premium.stripeSubscriptionId}:`, stripeError.message);
            }
          }
        }
      }

      return expiredCount;
    } catch (error) {
      console.error('   ❌ Error checking expired subscriptions:', error.message);
      return 0;
    }
  }

  /**
   * Sync canceled subscriptions from Stripe
   */
  async syncCanceledSubscriptions() {
    try {
      // Get recently canceled subscriptions from Stripe
      const subscriptions = await this.stripe.subscriptions.list({
        status: 'canceled',
        limit: 50,
        expand: ['data.customer'],
      });

      console.log(`   🔍 Found ${subscriptions.data.length} canceled subscriptions in Stripe`);

      let syncedCount = 0;

      for (const subscription of subscriptions.data) {
        try {
          const customerId = typeof subscription.customer === 'string' 
            ? subscription.customer 
            : subscription.customer.id;

          // Find user by subscription ID
          const { data: users, error: userError } = await this.supabase
            .from('user_profiles')
            .select('id, premium')
            .eq('stripe_customer_id', customerId);

          if (userError || !users || users.length === 0) {
            continue;
          }

          const user = users[0];

          // Only update if the user still has this subscription marked as active
          if (user.premium?.stripeSubscriptionId === subscription.id && user.premium?.isActive) {
            const currentPeriodEnd = subscription.current_period_end 
              ? new Date(subscription.current_period_end * 1000).toISOString() 
              : null;

            const { error: updateError } = await this.supabase
              .from('user_profiles')
              .update({
                premium: {
                  ...user.premium,
                  isActive: false,
                  status: 'canceled',
                  currentPeriodEnd: currentPeriodEnd,
                  canceledAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
                updated_at: new Date().toISOString(),
              })
              .eq('id', user.id);

            if (!updateError) {
              syncedCount++;
              console.log(`   🚫 Synced canceled subscription for user ${user.id}`);
            }
          }
        } catch (error) {
          console.error(`   ❌ Error processing canceled subscription ${subscription.id}:`, error.message);
        }
      }

      return syncedCount;
    } catch (error) {
      console.error('   ❌ Error syncing canceled subscriptions:', error.message);
      return 0;
    }
  }

  /**
   * Get sync status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastSyncTime: this.lastSyncTime,
      syncCount: this.syncCount,
      intervalMinutes: this.config.syncIntervalMs / 1000 / 60,
    };
  }
}

// Export singleton instance
module.exports = new SubscriptionSyncService();

