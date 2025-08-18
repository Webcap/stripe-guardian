const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
require('dotenv').config();

// Initialize clients
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20'
});

// Health check results
const healthResults = {
  webhookServer: false,
  webhookEvents: [],
  customerSync: [],
  subscriptionSync: [],
  databaseHealth: false,
  stripeHealth: false,
  recommendations: []
};

async function checkWebhookServer() {
  try {
    console.log('🔍 Checking webhook server status...');
    
    const response = await fetch('http://localhost:3001/ready');
    if (response.ok) {
      const status = await response.json();
      healthResults.webhookServer = true;
      console.log('✅ Webhook server is running');
      
      // Check if all required environment variables are set
      if (!status.checks?.env?.STRIPE_WEBHOOK_SECRET) {
        healthResults.recommendations.push('⚠️  STRIPE_WEBHOOK_SECRET is missing - webhook verification will fail');
      }
    } else {
      console.log('❌ Webhook server is not responding');
      healthResults.recommendations.push('🚨 Start webhook server with: npm run webhook:dev');
    }
  } catch (error) {
    console.log('❌ Webhook server is not running or not accessible');
    healthResults.recommendations.push('🚨 Start webhook server with: npm run webhook:dev');
  }
}

async function checkWebhookEvents() {
  try {
    console.log('🔍 Checking recent webhook events...');
    
    // Get recent webhook events from Stripe
    const events = await stripe.events.list({
      limit: 20,
      types: [
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'customer.created',
        'invoice.payment_succeeded',
        'invoice.payment_failed'
      ]
    });
    
    console.log(`📊 Found ${events.data.length} recent webhook events`);
    
    events.data.forEach(event => {
      const eventInfo = {
        id: event.id,
        type: event.type,
        created: new Date(event.created * 1000).toISOString(),
        livemode: event.livemode,
        status: event.data?.object?.status || 'unknown'
      };
      
      healthResults.webhookEvents.push(eventInfo);
      
      // Check for failed webhook deliveries
      if (event.delivery_attempts && event.delivery_attempts > 1) {
        healthResults.recommendations.push(`⚠️  Webhook event ${event.id} had ${event.delivery_attempts} delivery attempts`);
      }
    });
    
  } catch (error) {
    console.error('❌ Error checking webhook events:', error);
    healthResults.recommendations.push('🚨 Unable to fetch webhook events from Stripe');
  }
}

async function checkCustomerSync() {
  try {
    console.log('🔍 Checking customer sync status...');
    
    // Get all Stripe customers
    const stripeCustomers = await stripe.customers.list({ limit: 100 });
    console.log(`📊 Found ${stripeCustomers.data.length} customers in Stripe`);
    
    // Get all users with premium subscriptions
    const { data: premiumUsers, error } = await supabase
      .from('user_profiles')
      .select('id, stripe_customer_id, premium')
      .not('premium', 'is', null);
    
    if (error) {
      console.error('❌ Error fetching premium users:', error);
      return;
    }
    
    console.log(`📊 Found ${premiumUsers.length} users with premium in database`);
    
    // Check for sync issues
    stripeCustomers.data.forEach(stripeCustomer => {
      const userId = stripeCustomer.metadata?.userId;
      if (userId) {
        const dbUser = premiumUsers.find(u => u.id === userId);
        if (!dbUser) {
          healthResults.customerSync.push({
            type: 'missing_user',
            stripeCustomerId: stripeCustomer.id,
            userId: userId,
            email: stripeCustomer.email
          });
          healthResults.recommendations.push(`🚨 Stripe customer ${stripeCustomer.id} references user ${userId} that doesn't exist in database`);
        } else if (!dbUser.stripe_customer_id) {
          healthResults.customerSync.push({
            type: 'missing_stripe_id',
            stripeCustomerId: stripeCustomer.id,
            userId: userId,
            email: stripeCustomer.email
          });
          healthResults.recommendations.push(`⚠️  User ${userId} has premium but missing stripe_customer_id`);
        }
      }
    });
    
    // Check for users with premium but no Stripe customer ID
    premiumUsers.forEach(user => {
      if (!user.stripe_customer_id) {
        healthResults.customerSync.push({
          type: 'orphaned_premium',
          userId: user.id,
          premium: user.premium
        });
        healthResults.recommendations.push(`⚠️  User ${user.id} has premium subscription but no Stripe customer ID`);
      }
    });
    
  } catch (error) {
    console.error('❌ Error checking customer sync:', error);
    healthResults.recommendations.push('🚨 Unable to check customer sync status');
  }
}

async function checkSubscriptionSync() {
  try {
    console.log('🔍 Checking subscription sync status...');
    
    // Get all active subscriptions from Stripe
    const subscriptions = await stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      expand: ['data.customer']
    });
    
    console.log(`📊 Found ${subscriptions.data.length} active subscriptions in Stripe`);
    
    // Get premium users for comparison
    const { data: premiumUsers, error } = await supabase
      .from('user_profiles')
      .select('id, premium')
      .not('premium', 'is', null);
    
    if (error) {
      console.error('Error fetching premium users for subscription sync check:', error);
      return;
    }
    
    subscriptions.data.forEach(subscription => {
      const customer = subscription.customer;
      if (typeof customer === 'object') {
        const userId = customer.metadata?.userId;
        if (userId) {
          // Check if subscription is properly reflected in database
          const dbUser = premiumUsers.find(u => u.id === userId);
          if (dbUser && dbUser.premium) {
            if (dbUser.premium.stripeSubscriptionId !== subscription.id) {
              healthResults.subscriptionSync.push({
                type: 'subscription_mismatch',
                userId: userId,
                stripeSubscriptionId: subscription.id,
                dbSubscriptionId: dbUser.premium.stripeSubscriptionId
              });
              healthResults.recommendations.push(`⚠️  User ${userId} has subscription ID mismatch`);
            }
          }
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error checking subscription sync:', error);
    healthResults.recommendations.push('🚨 Unable to check subscription sync status');
  }
}

async function checkDatabaseHealth() {
  try {
    console.log('🔍 Checking database health...');
    
    // Test basic database operations
    const { data, error } = await supabase
      .from('user_profiles')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('❌ Database connection failed:', error);
      healthResults.recommendations.push('🚨 Database connection is failing');
    } else {
      healthResults.databaseHealth = true;
      console.log('✅ Database connection is healthy');
    }
    
  } catch (error) {
    console.error('❌ Database health check failed:', error);
    healthResults.recommendations.push('🚨 Database health check failed');
  }
}

async function checkStripeHealth() {
  try {
    console.log('🔍 Checking Stripe API health...');
    
    // Test Stripe API connection
    await stripe.customers.list({ limit: 1 });
    healthResults.stripeHealth = true;
    console.log('✅ Stripe API is healthy');
    
  } catch (error) {
    console.error('❌ Stripe API health check failed:', error);
    healthResults.recommendations.push('🚨 Stripe API connection is failing');
  }
}

async function generateReport() {
  console.log('\n📊 Stripe Health Check Report');
  console.log('================================');
  
  console.log(`\n🔌 Webhook Server: ${healthResults.webhookServer ? '✅ Running' : '❌ Not Running'}`);
  console.log(`💳 Webhook Events: ${healthResults.webhookEvents.length} recent events`);
  console.log(`👥 Customer Sync Issues: ${healthResults.customerSync.length}`);
  console.log(`📅 Subscription Sync Issues: ${healthResults.subscriptionSync.length}`);
  console.log(`🗄️  Database: ${healthResults.databaseHealth ? '✅ Healthy' : '❌ Issues'}`);
  console.log(`💳 Stripe API: ${healthResults.stripeHealth ? '✅ Healthy' : '❌ Issues'}`);
  
  if (healthResults.recommendations.length > 0) {
    console.log('\n🚨 Issues Found:');
    healthResults.recommendations.forEach((rec, index) => {
      console.log(`${index + 1}. ${rec}`);
    });
  } else {
    console.log('\n✅ All systems are healthy!');
  }
  
  // Save report to file
  const fs = require('fs');
  const reportPath = `stripe-health-report-${new Date().toISOString().split('T')[0]}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(healthResults, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
}

async function main() {
  console.log('🚀 Stripe Health Check Script\n');
  
  await checkWebhookServer();
  await checkWebhookEvents();
  await checkCustomerSync();
  await checkSubscriptionSync();
  await checkDatabaseHealth();
  await checkStripeHealth();
  
  await generateReport();
  
  console.log('\n✨ Health check completed');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  checkWebhookServer,
  checkWebhookEvents,
  checkCustomerSync,
  checkSubscriptionSync,
  checkDatabaseHealth,
  checkStripeHealth,
  generateReport
};
