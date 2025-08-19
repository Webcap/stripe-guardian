/**
 * 🚀 Stripe Prevention System - Auto Guardian Script
 * This script automatically monitors and fixes Stripe sync issues
 * It runs continuously to ensure data consistency between Supabase and Stripe
 * 
 * FIXED: Customer creation now properly uses user's email instead of 'unknown@example.com'
 * - First tries to get email from user_profiles table
 * - Falls back to Supabase auth admin API if needed
 * - Uses descriptive fallback email if both fail
 * 
 * NEW: Double subscription prevention - prevents creating duplicate customers
 * when users already have active or pending subscriptions
 */
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

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
let webhookServerProcess = null;
let healthCheckInterval = null;
let autoFixInterval = null;
let lastHealthCheck = null;
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;

// Configuration
const CONFIG = {
  healthCheckIntervalMs: 2 * 60 * 1000, // 2 minutes
  autoFixIntervalMs: 5 * 60 * 1000, // 5 minutes
  webhookServerPort: 3001,
  webhookServerPath: path.join(__dirname, '../server/webhook-server.js'),
  maxRetries: 3,
  retryDelayMs: 10000, // 10 seconds
};

// Logging
const LOG_FILE = `stripe-guardian-${new Date().toISOString().split('T')[0]}.log`;

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  
  console.log(logMessage);
  
  // Also write to log file
  fs.appendFileSync(LOG_FILE, logMessage + '\n');
}

// Auto-start webhook server
async function startWebhookServer() {
  if (webhookServerProcess && !webhookServerProcess.killed) {
    log('Webhook server already running');
    return true;
  }

  try {
    log('Starting webhook server automatically...');
    
    webhookServerProcess = spawn('node', [CONFIG.webhookServerPath], {
      stdio: 'pipe',
      detached: false
    });

    // Handle webhook server output
    webhookServerProcess.stdout.on('data', (data) => {
      log(`Webhook Server: ${data.toString().trim()}`);
    });

    webhookServerProcess.stderr.on('data', (data) => {
      log(`Webhook Server Error: ${data.toString().trim()}`, 'ERROR');
    });

    webhookServerProcess.on('close', (code) => {
      log(`Webhook server process exited with code ${code}`, 'WARN');
      webhookServerProcess = null;
      
      // Auto-restart after delay
      setTimeout(() => {
        if (isRunning) {
          log('Auto-restarting webhook server...');
          startWebhookServer();
        }
      }, CONFIG.retryDelayMs);
    });

    // Wait for server to be ready
    await waitForWebhookServer();
    log('Webhook server started successfully');
    return true;
    
  } catch (error) {
    log(`Failed to start webhook server: ${error.message}`, 'ERROR');
    return false;
  }
}

// Wait for webhook server to be ready
async function waitForWebhookServer(maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`http://localhost:${CONFIG.webhookServerPort}/ready`);
      if (response.ok) {
        return true;
      }
    } catch (error) {
      // Server not ready yet
    }
    
    // Wait before next attempt
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error('Webhook server failed to start within expected time');
}

// Automatic health check
async function performHealthCheck() {
  try {
    log('Performing automatic health check...');
    
    const healthResults = {
      webhookServer: false,
      customerSync: [],
      subscriptionSync: [],
      databaseHealth: false,
      stripeHealth: false,
      issues: []
    };

    // Check webhook server
    try {
      const response = await fetch(`http://localhost:${CONFIG.webhookServerPort}/ready`);
      healthResults.webhookServer = response.ok;
      if (!response.ok) {
        healthResults.issues.push('Webhook server not responding');
      }
    } catch (error) {
      healthResults.issues.push('Webhook server not accessible');
    }

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

      // Try to get email from user_profiles first, then fallback to auth.users
      let userEmail = userProfile.email;
      
      log(`Email from user profile: ${userEmail || 'not found'}`);
      
      if (!userEmail) {
        log(`Email not found in user_profiles for ${issue.userId}, trying auth admin API...`, 'WARN');
        
        try {
          // Get user's email using Supabase auth admin API
          const { data: user, error: userError } = await supabase.auth.admin.getUserById(issue.userId);
          
          if (userError) {
            log(`Error fetching user email for ${issue.userId}: ${userError.message}`, 'ERROR');
            
            // Create a fallback email using the user ID (format: user-{first8chars}@notez-react.app)
            userEmail = `user-${issue.userId.substring(0, 8)}@notez-react.app`;
            log(`Using fallback email due to auth API error: ${userEmail}`, 'WARN');
          } else if (!user || !user.user || !user.user.email) {
            log(`User email not found for ${issue.userId}, user data: ${JSON.stringify(user)}`, 'WARN');
            
            // Create a fallback email using the user ID (format: user-{first8chars}@notez-react.app)
            userEmail = `user-${issue.userId.substring(0, 8)}@notez-react.app`;
            log(`Using fallback email: ${userEmail}`, 'WARN');
          } else {
            userEmail = user.user.email;
            log(`Successfully retrieved email from auth admin API: ${userEmail}`);
          }
        } catch (error) {
          log(`Unexpected error fetching user email for ${issue.userId}: ${error.message}`, 'ERROR');
          
          // Create a fallback email using the user ID (format: user-{first8chars}@notez-react.app)
          userEmail = `user-${issue.userId.substring(0, 8)}@notez-react.app`;
          log(`Using fallback email due to unexpected error: ${userEmail}`, 'WARN');
        }
      }

      log(`Found email ${userEmail} for user ${issue.userId}`);

              // Search Stripe for customer with this user ID
        const customers = await stripe.customers.list({
          limit: 100,
          expand: ['data.subscriptions']
        });

        const stripeCustomer = customers.data.find(c => 
          c.metadata?.userId === issue.userId
        );

        // Also check if there are any existing subscriptions for this user
        let existingSubscription = null;
        if (stripeCustomer && stripeCustomer.subscriptions) {
          const activeSubscriptions = stripeCustomer.subscriptions.data.filter(sub => 
            ['active', 'trialing', 'incomplete', 'past_due', 'unpaid'].includes(sub.status)
          );
          if (activeSubscriptions.length > 0) {
            existingSubscription = activeSubscriptions[0]; // Most recent
          }
        }

              if (stripeCustomer) {
          log(`Found Stripe customer ${stripeCustomer.id} for user ${issue.userId}`);
          
          // If there's an existing subscription, update the user profile with it
          if (existingSubscription) {
            log(`Found existing subscription ${existingSubscription.id} with status ${existingSubscription.status} for user ${issue.userId}`);
            
            const { error: updateError } = await supabase
              .from('user_profiles')
              .update({
                stripe_customer_id: stripeCustomer.id,
                premium: {
                  isActive: ['active', 'trialing'].includes(existingSubscription.status),
                  type: existingSubscription.metadata?.planId || 'unknown',
                  stripeSubscriptionId: existingSubscription.id,
                  stripeCustomerId: stripeCustomer.id,
                  status: existingSubscription.status,
                  currentPeriodEnd: existingSubscription.current_period_end ? new Date(existingSubscription.current_period_end * 1000).toISOString() : null,
                },
                updated_at: new Date().toISOString()
              })
              .eq('id', issue.userId);

            if (updateError) {
              log(`Failed to update user ${issue.userId} with subscription: ${updateError.message}`, 'ERROR');
            } else {
              log(`Successfully updated user ${issue.userId} with existing subscription ${existingSubscription.id}`);
            }
          } else {
            // Just update the customer ID
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
          }
                } else {
          // Before creating a new customer, check if there are any subscriptions with this user ID in metadata
          try {
            const allSubscriptions = await stripe.subscriptions.list({
              limit: 100,
              expand: ['data.customer']
            });

            const userSubscriptions = allSubscriptions.data.filter(sub => 
              sub.metadata?.userId === issue.userId
            );

            if (userSubscriptions.length > 0) {
              const mostRecent = userSubscriptions[0];
              log(`Found existing subscription ${mostRecent.id} for user ${issue.userId} but no customer record, linking to existing customer ${mostRecent.customer.id}`);
              
              // Update user profile with existing subscription and customer
              const { error: updateError } = await supabase
                .from('user_profiles')
                .update({
                  stripe_customer_id: mostRecent.customer.id,
                  premium: {
                    isActive: ['active', 'trialing'].includes(mostRecent.status),
                    type: mostRecent.metadata?.planId || 'unknown',
                    stripeSubscriptionId: mostRecent.id,
                    stripeCustomerId: mostRecent.customer.id,
                    status: mostRecent.status,
                    currentPeriodEnd: mostRecent.current_period_end ? new Date(mostRecent.current_period_end * 1000).toISOString() : null,
                  },
                  updated_at: new Date().toISOString()
                })
                .eq('id', issue.userId);

              if (updateError) {
                log(`Failed to update user ${issue.userId} with existing subscription: ${updateError.message}`, 'ERROR');
              } else {
                log(`Successfully linked user ${issue.userId} to existing subscription ${mostRecent.id}`);
              }
              continue; // Skip creating new customer
            }
          } catch (error) {
            log(`Error checking for existing subscriptions: ${error.message}`, 'WARN');
          }

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
    // Kill existing webhook server
    if (webhookServerProcess) {
      webhookServerProcess.kill('SIGKILL');
      webhookServerProcess = null;
    }

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Restart webhook server
    await startWebhookServer();

    // Reset failure counter
    consecutiveFailures = 0;
    
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
      // Check if this event was processed recently
      const eventKey = `${event.id}_${event.type}`;
      const eventLogPath = path.join(__dirname, '../logs', 'processed-events.log');
      
      if (!fs.existsSync(path.dirname(eventLogPath))) {
        fs.mkdirSync(path.dirname(eventLogPath), { recursive: true });
      }
      
      const processedEvents = fs.existsSync(eventLogPath) 
        ? fs.readFileSync(eventLogPath, 'utf8').split('\n').filter(Boolean)
        : [];
      
      if (processedEvents.includes(eventKey)) {
        continue; // Already processed
      }

      log(`Processing webhook event: ${event.type} (${event.id})`);
      
      // Process the event
      await processWebhookEvent(event);
      
      // Mark as processed
      fs.appendFileSync(eventLogPath, eventKey + '\n');
    }
    
  } catch (error) {
    log(`Webhook event monitoring failed: ${error.message}`, 'ERROR');
  }
}

// Process individual webhook events
async function processWebhookEvent(event) {
  try {
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event);
        break;
      case 'customer.created':
        await handleCustomerCreated(event);
        break;
      default:
        log(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    log(`Failed to process event ${event.id}: ${error.message}`, 'ERROR');
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

// Start the guardian
async function startGuardian() {
  if (isRunning) {
    log('Guardian is already running');
    return;
  }

  isRunning = true;
  log('🚀 Starting Stripe Guardian - Automatic Protection System');
  
  try {
    // Start webhook server automatically
    await startWebhookServer();
    
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
    log(`🌐 Webhook server running on port ${CONFIG.webhookServerPort}`);
    
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
  
  // Stop webhook server
  if (webhookServerProcess) {
    webhookServerProcess.kill('SIGTERM');
    webhookServerProcess = null;
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
