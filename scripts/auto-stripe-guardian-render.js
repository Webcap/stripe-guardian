/**
 * 🚀 Stripe Guardian - Render Production Version
 * Optimized for Render deployment with better error handling and monitoring
 */
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Load environment variables (only in development)
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config();
  } catch (error) {
    console.log('dotenv not available, using system environment variables');
  }
}

// Validate required environment variables
const requiredEnvVars = [
  'STRIPE_SECRET_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars);
  console.error('Please set these in your Render environment variables');
  process.exit(1);
}

// Initialize clients
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20'
});

// Guardian state
let isRunning = false;
let healthCheckInterval = null;
let autoFixInterval = null;
let lastHealthCheck = null;
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;

// Configuration
const CONFIG = {
  healthCheckIntervalMs: 2 * 60 * 1000, // 2 minutes
  autoFixIntervalMs: 5 * 60 * 1000, // 5 minutes
  port: process.env.PORT || 3001,
  maxRetries: 3,
  retryDelayMs: 10000, // 10 seconds
};

// Logging
const LOG_FILE = `stripe-guardian-${new Date().toISOString().split('T')[0]}.log`;

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  
  console.log(logMessage);
  
  // Also write to log file (only if we have write permissions)
  try {
    fs.appendFileSync(LOG_FILE, logMessage + '\n');
  } catch (error) {
    // In production environments, we might not have write permissions
    // This is fine, we'll just log to console
  }
}

// Create HTTP server for Render health checks
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  if (req.url === '/health') {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      guardian: {
        isRunning,
        lastHealthCheck: lastHealthCheck ? new Date(lastHealthCheck).toISOString() : null,
        consecutiveFailures,
        uptime: process.uptime()
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
        hasSupabaseUrl: !!process.env.SUPABASE_URL,
        hasSupabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        port: CONFIG.port
      }
    };
    
    res.writeHead(200);
    res.end(JSON.stringify(healthStatus, null, 2));
  } else if (req.url === '/ready') {
    const readiness = {
      status: 'ready',
      timestamp: new Date().toISOString(),
      guardian: isRunning,
      uptime: process.uptime()
    };
    
    res.writeHead(200);
    res.end(JSON.stringify(readiness, null, 2));
  } else if (req.url === '/') {
    const info = {
      service: 'Stripe Guardian',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
      endpoints: {
        health: '/health',
        ready: '/ready'
      }
    };
    
    res.writeHead(200);
    res.end(JSON.stringify(info, null, 2));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not Found', availableEndpoints: ['/', '/health', '/ready'] }));
  }
});

// Automatic health check
async function performHealthCheck() {
  try {
    log('Performing automatic health check...');
    
    const healthResults = {
      customerSync: [],
      subscriptionSync: [],
      databaseHealth: false,
      stripeHealth: false,
      issues: []
    };

    // Check database health
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('count')
        .limit(1);
      
      healthResults.databaseHealth = !error;
      if (error) {
        healthResults.issues.push(`Database error: ${error.message}`);
      }
    } catch (error) {
      healthResults.issues.push(`Database connection failed: ${error.message}`);
    }

    // Check Stripe health
    try {
      await stripe.customers.list({ limit: 1 });
      healthResults.stripeHealth = true;
    } catch (error) {
      healthResults.issues.push(`Stripe API error: ${error.message}`);
    }

    // Check customer sync
    try {
      const { data: premiumUsers, error } = await supabase
        .from('user_profiles')
        .select('id, premium, stripe_customer_id')
        .not('premium', 'is', null);
      
      if (!error && premiumUsers) {
        premiumUsers.forEach(user => {
          if (!user.stripe_customer_id) {
            healthResults.customerSync.push({
              userId: user.id,
              issue: 'Missing Stripe customer ID',
              premium: user.premium
            });
          }
        });
      }
    } catch (error) {
      healthResults.issues.push(`Customer sync check failed: ${error.message}`);
    }

    // Log results
    if (healthResults.issues.length > 0 || healthResults.customerSync.length > 0) {
      log(`Health check found ${healthResults.issues.length} system issues and ${healthResults.customerSync.length} customer sync issues`, 'WARN');
      
      if (healthResults.customerSync.length > 0) {
        log('Customer sync issues found, will attempt auto-fix', 'WARN');
        await autoFixCustomerSyncIssues(healthResults.customerSync);
      }
    } else {
      log('Health check passed - all systems healthy');
      consecutiveFailures = 0;
    }

    lastHealthCheck = Date.now();
    
  } catch (error) {
    log(`Health check failed: ${error.message}`, 'ERROR');
    consecutiveFailures++;
    
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      log(`Too many consecutive failures (${consecutiveFailures}), attempting emergency recovery`, 'ERROR');
      await emergencyRecovery();
    }
  }
}

// Auto-fix customer sync issues
async function autoFixCustomerSyncIssues(syncIssues) {
  log(`Attempting to auto-fix ${syncIssues.length} customer sync issues...`);
  
  for (const issue of syncIssues) {
    try {
      log(`Fixing customer sync for user ${issue.userId}...`);
      
      // Try to find the user's profile and email
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', issue.userId)
        .single();
      
      if (!userProfile) {
        log(`User profile ${issue.userId} not found, skipping`, 'WARN');
        continue;
      }

      log(`User profile found for ${issue.userId}, available fields: ${JSON.stringify(Object.keys(userProfile))}`);

      // Try to get email from auth admin API
      let userEmail = null;
      try {
        const { data: user, error: userError } = await supabase.auth.admin.getUserById(issue.userId);
        
        if (userError) {
          log(`Error fetching user email for ${issue.userId}: ${userError.message}`, 'ERROR');
          userEmail = `user-${issue.userId.substring(0, 8)}@notez-react.app`;
        } else if (!user || !user.user || !user.user.email) {
          log(`User email not found for ${issue.userId}`, 'WARN');
          userEmail = `user-${issue.userId.substring(0, 8)}@notez-react.app`;
        } else {
          userEmail = user.user.email;
          log(`Successfully retrieved email: ${userEmail}`);
        }
      } catch (error) {
        log(`Unexpected error fetching user email: ${error.message}`, 'ERROR');
        userEmail = `user-${issue.userId.substring(0, 8)}@notez-react.app`;
      }

      log(`Using email ${userEmail} for user ${issue.userId}`);

      // Search Stripe for existing customer
      const customers = await stripe.customers.list({
        limit: 100,
        expand: ['data.subscriptions']
      });

      const stripeCustomer = customers.data.find(c => 
        c.metadata?.userId === issue.userId
      );

      if (stripeCustomer) {
        log(`Found existing Stripe customer ${stripeCustomer.id} for user ${issue.userId}`);
        
        // Update user profile with customer ID
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({
            stripe_customer_id: stripeCustomer.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', issue.userId);

        if (updateError) {
          log(`Failed to update user ${issue.userId}: ${updateError.message}`, 'ERROR');
        } else {
          log(`Successfully fixed customer sync for user ${issue.userId}`);
        }
      } else {
        log(`No Stripe customer found for user ${issue.userId}, creating one with email ${userEmail}...`, 'WARN');
        
        // Create new Stripe customer
        const customer = await stripe.customers.create({
          email: userEmail,
          metadata: {
            userId: issue.userId,
          },
        });

        // Update user profile
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({
            stripe_customer_id: customer.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', issue.userId);

        if (updateError) {
          log(`Failed to update user ${issue.userId}: ${updateError.message}`, 'ERROR');
        } else {
          log(`Successfully created and linked Stripe customer ${customer.id} for user ${issue.userId}`);
        }
      }
      
    } catch (error) {
      log(`Failed to auto-fix user ${issue.userId}: ${error.message}`, 'ERROR');
    }
  }
}

// Emergency recovery
async function emergencyRecovery() {
  log('Starting emergency recovery...', 'ERROR');
  
  try {
    // Reset failure counter
    consecutiveFailures = 0;
    
    // Perform a health check
    await performHealthCheck();
    
    log('Emergency recovery completed');
    
  } catch (error) {
    log(`Emergency recovery failed: ${error.message}`, 'ERROR');
  }
}

// Monitor webhook events automatically
async function monitorWebhookEvents() {
  try {
    const events = await stripe.events.list({
      limit: 10,
      types: [
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'customer.created'
      ]
    });

    for (const event of events.data) {
      log(`Processing webhook event: ${event.type} (${event.id})`);
      
      // Process the event based on type
      switch (event.type) {
        case 'customer.created':
          await handleCustomerCreated(event);
          break;
        case 'customer.subscription.created':
          await handleSubscriptionCreated(event);
          break;
        default:
          log(`Unhandled event type: ${event.type}`);
      }
    }
    
  } catch (error) {
    log(`Webhook event monitoring failed: ${error.message}`, 'ERROR');
  }
}

// Handle customer created events
async function handleCustomerCreated(event) {
  const customer = event.data.object;
  const userId = customer.metadata?.userId;
  
  if (userId) {
    try {
      // Verify customer ID is synced
      const { data: user } = await supabase
        .from('user_profiles')
        .select('stripe_customer_id')
        .eq('id', userId)
        .single();
      
      if (!user?.stripe_customer_id || user.stripe_customer_id !== customer.id) {
        log(`Auto-fixing customer sync for customer ${customer.id}`, 'WARN');
        
        const { error } = await supabase
          .from('user_profiles')
          .update({
            stripe_customer_id: customer.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId);
        
        if (error) {
          log(`Failed to auto-fix customer sync: ${error.message}`, 'ERROR');
        } else {
          log(`Successfully auto-fixed customer sync for user ${userId}`);
        }
      }
    } catch (error) {
      log(`Failed to handle customer created: ${error.message}`, 'ERROR');
    }
  }
}

// Handle subscription created events
async function handleSubscriptionCreated(event) {
  const subscription = event.data.object;
  const customerId = subscription.customer;
  
  if (typeof customerId === 'string') {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      const userId = customer.metadata?.userId;
      
      if (userId) {
        // Verify customer ID is synced
        const { data: user } = await supabase
          .from('user_profiles')
          .select('stripe_customer_id')
          .eq('id', userId)
          .single();
        
        if (!user?.stripe_customer_id || user.stripe_customer_id !== customerId) {
          log(`Auto-fixing customer sync for subscription ${subscription.id}`, 'WARN');
          
          const { error } = await supabase
            .from('user_profiles')
            .update({
              stripe_customer_id: customerId,
              updated_at: new Date().toISOString()
            })
            .eq('id', userId);
          
          if (error) {
            log(`Failed to auto-fix customer sync: ${error.message}`, 'ERROR');
          } else {
            log(`Successfully auto-fixed customer sync for user ${userId}`);
          }
        }
      }
    } catch (error) {
      log(`Failed to handle subscription created: ${error.message}`, 'ERROR');
    }
  }
}

// Start the guardian
async function startGuardian() {
  if (isRunning) {
    log('Guardian is already running');
    return;
  }

  isRunning = true;
  log('🚀 Starting Stripe Guardian - Render Production Version');
  
  try {
    // Start health check loop
    healthCheckInterval = setInterval(performHealthCheck, CONFIG.healthCheckIntervalMs);
    
    // Start auto-fix loop
    autoFixInterval = setInterval(async () => {
      if (isRunning) {
        await monitorWebhookEvents();
      }
    }, CONFIG.autoFixIntervalMs);
    
    // Perform initial health check
    await performHealthCheck();
    
    log('✅ Stripe Guardian is now running automatically');
    log(`📊 Health checks every ${CONFIG.healthCheckIntervalMs / 1000} seconds`);
    log(`🔧 Auto-fixes every ${CONFIG.autoFixIntervalMs / 1000} seconds`);
    log(`🌐 HTTP server running on port ${CONFIG.port}`);
    
  } catch (error) {
    log(`Failed to start guardian: ${error.message}`, 'ERROR');
    isRunning = false;
  }
}

// Stop the guardian
async function stopGuardian() {
  log('🛑 Stopping Stripe Guardian...');
  
  isRunning = false;
  
  // Clear intervals
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
  
  if (autoFixInterval) {
    clearInterval(autoFixInterval);
    autoFixInterval = null;
  }
  
  log('✅ Stripe Guardian stopped');
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  log('Received SIGINT, shutting down gracefully...');
  await stopGuardian();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log('Received SIGTERM, shutting down gracefully...');
  await stopGuardian();
  process.exit(0);
});

// Main execution
async function main() {
  try {
    log('🚀 Stripe Guardian starting up...');
    log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    log(`Port: ${CONFIG.port}`);
    
    // Start HTTP server
    server.listen(CONFIG.port, () => {
      log(`HTTP server listening on port ${CONFIG.port}`);
    });
    
    // Start guardian
    await startGuardian();
    
    // Keep the process running
    process.stdin.resume();
    
  } catch (error) {
    log(`Guardian startup failed: ${error.message}`, 'ERROR');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  startGuardian,
  stopGuardian,
  isRunning: () => isRunning
};
