/**
 * Example: Using Supabase Admin Clients (stripe-guardian)
 * 
 * This script demonstrates how to use the new supabase-admin clients
 * which support both new sb_secret_... keys and legacy service_role keys.
 * 
 * Usage:
 *   node scripts/example-admin-usage.js
 * 
 * Environment Variables Required:
 *   - SUPABASE_URL and (SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY)
 *   - WIZNOTE_SUPABASE_URL and (WIZNOTE_SUPABASE_SECRET_KEY or WIZNOTE_SUPABASE_SERVICE_KEY)
 */

require('dotenv').config();
const { 
  supabaseAdmin, 
  wiznoteAdmin, 
  getAdminKeyInfo, 
  validateAdminKey 
} = require('../server/lib/supabase-admin');

async function main() {
  console.log('='.repeat(60));
  console.log('Stripe Guardian - Supabase Admin Clients Example');
  console.log('='.repeat(60));
  
  // Check stripe-guardian database key
  console.log('\n📊 Stripe-Guardian Database Key:');
  const sgKeyInfo = getAdminKeyInfo();
  console.log('  - Has Secret Key:', sgKeyInfo.hasSecretKey ? '✅' : '❌');
  console.log('  - Has Service Role Key:', sgKeyInfo.hasServiceRoleKey ? '✅' : '❌');
  console.log('  - Using New Format:', sgKeyInfo.usingNewFormat ? '✅ YES' : '⚠️  NO (Legacy)');
  console.log('  - Key Type:', sgKeyInfo.keyType);
  
  // Check wiznote database key
  console.log('\n📊 Wiznote Database Key:');
  const wzKeyInfo = getAdminKeyInfo('WIZNOTE_SUPABASE');
  console.log('  - Has Secret Key:', wzKeyInfo.hasSecretKey ? '✅' : '❌');
  console.log('  - Has Service Role Key:', wzKeyInfo.hasServiceRoleKey ? '✅' : '❌');
  console.log('  - Using New Format:', wzKeyInfo.usingNewFormat ? '✅ YES' : '⚠️  NO (Legacy)');
  console.log('  - Key Type:', wzKeyInfo.keyType);
  
  // Validate keys
  const sgValid = validateAdminKey();
  const wzValid = validateAdminKey('WIZNOTE_SUPABASE');
  
  if (!sgValid || !wzValid) {
    console.error('\n❌ One or more admin keys missing!');
    if (!sgValid) {
      console.error('Stripe-Guardian: Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY');
    }
    if (!wzValid) {
      console.error('Wiznote: Set WIZNOTE_SUPABASE_SECRET_KEY or WIZNOTE_SUPABASE_SERVICE_KEY');
    }
    process.exit(1);
  }
  
  console.log('\n✅ Both admin keys validated successfully!\n');
  
  // Example 1: Query stripe-guardian's own data
  console.log('Example 1: Querying stripe-guardian database...');
  try {
    // This would query stripe-guardian's own tables if they exist
    // Replace with actual table names from your schema
    console.log('  (Configure with your stripe-guardian table names)');
  } catch (error) {
    console.error('  Error:', error.message);
  }
  
  // Example 2: Query wiznote user profiles
  console.log('\nExample 2: Querying wiznote user profiles...');
  try {
    const { data: profiles, error } = await wiznoteAdmin
      .from('user_profiles')
      .select('id, email, subscription_plan, stripe_customer_id')
      .limit(5);
    
    if (error) throw error;
    console.log(`  Found ${profiles.length} profiles`);
    profiles.forEach((profile, index) => {
      console.log(`  ${index + 1}. ${profile.email}`);
      console.log(`     Plan: ${profile.subscription_plan || 'free'}`);
      console.log(`     Stripe Customer: ${profile.stripe_customer_id || 'none'}`);
    });
  } catch (error) {
    console.error('  Error:', error.message);
  }
  
  // Example 3: Count subscription plans
  console.log('\nExample 3: Counting subscription plans...');
  try {
    const { data: plans, error } = await wiznoteAdmin
      .from('user_profiles')
      .select('subscription_plan')
      .not('subscription_plan', 'is', null);
    
    if (error) throw error;
    
    const planCounts = plans.reduce((acc, p) => {
      acc[p.subscription_plan] = (acc[p.subscription_plan] || 0) + 1;
      return acc;
    }, {});
    
    console.log('  Plan distribution:');
    Object.entries(planCounts).forEach(([plan, count]) => {
      console.log(`    - ${plan}: ${count} users`);
    });
  } catch (error) {
    console.error('  Error:', error.message);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Examples completed successfully!');
  console.log('='.repeat(60));
  
  // Migration tips
  if (!sgKeyInfo.usingNewFormat || !wzKeyInfo.usingNewFormat) {
    console.log('\n💡 Migration Recommendations:');
    if (!sgKeyInfo.usingNewFormat) {
      console.log('   📌 Stripe-Guardian: Migrate to SUPABASE_SECRET_KEY');
    }
    if (!wzKeyInfo.usingNewFormat) {
      console.log('   📌 Wiznote: Migrate to WIZNOTE_SUPABASE_SECRET_KEY');
    }
    console.log('\n   Benefits:');
    console.log('   - Easier rotation without downtime');
    console.log('   - Better security (not tied to JWT secret)');
    console.log('   - Individual key revocation');
    console.log('   - See: SUPABASE_API_KEY_MIGRATION.md');
  }
}

main().catch(console.error);

