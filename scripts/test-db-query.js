const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDatabaseQuery() {
  try {
    console.log('🔍 Testing database queries...\n');
    
    // Test 1: Get all users (without email column)
    console.log('1. All users:');
    const { data: allUsers, error: allUsersError } = await supabase
      .from('user_profiles')
      .select('*')
      .limit(5);
    
    if (allUsersError) {
      console.error('❌ Error fetching all users:', allUsersError);
    } else {
      console.log(`Found ${allUsers.length} users:`);
      if (allUsers.length > 0) {
        console.log('Available columns:', Object.keys(allUsers[0]));
        allUsers.forEach(user => {
          console.log(`  - ${user.id}: premium=${JSON.stringify(user.premium)}, stripe_customer_id=${user.stripe_customer_id}`);
        });
      }
    }
    
    console.log('\n2. Users with premium (not null):');
    const { data: premiumUsers, error: premiumError } = await supabase
      .from('user_profiles')
      .select('*')
      .not('premium', 'is', null);
    
    if (premiumError) {
      console.error('❌ Error fetching premium users:', premiumError);
    } else {
      console.log(`Found ${premiumUsers.length} premium users:`);
      premiumUsers.forEach(user => {
        console.log(`  - ${user.id}: premium=${JSON.stringify(user.premium)}, stripe_customer_id=${user.stripe_customer_id}`);
      });
    }
    
    console.log('\n3. Users with premium but no stripe_customer_id:');
    const { data: missingCustomerId, error: missingError } = await supabase
      .from('user_profiles')
      .select('*')
      .not('premium', 'is', null)
      .or('stripe_customer_id.is.null');
    
    if (missingError) {
      console.error('❌ Error fetching users missing customer ID:', missingError);
    } else {
      console.log(`Found ${missingCustomerId.length} users missing customer ID:`);
      missingCustomerId.forEach(user => {
        console.log(`  - ${user.id}: premium=${JSON.stringify(user.premium)}, stripe_customer_id=${user.stripe_customer_id}`);
      });
    }
    
    console.log('\n4. Users with premium and stripe_customer_id:');
    const { data: completeUsers, error: completeError } = await supabase
      .from('user_profiles')
      .select('*')
      .not('premium', 'is', null)
      .not('stripe_customer_id', 'is', null);
    
    if (completeError) {
      console.error('❌ Error fetching complete users:', completeError);
    } else {
      console.log(`Found ${completeUsers.length} complete users:`);
      completeUsers.forEach(user => {
        console.log(`  - ${user.id}: premium=${JSON.stringify(user.premium)}, stripe_customer_id=${user.stripe_customer_id}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testDatabaseQuery();
