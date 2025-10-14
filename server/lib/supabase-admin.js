/**
 * Supabase Admin Client Configuration
 * 
 * This module provides server-side admin access to Supabase with support for:
 * - NEW: sb_secret_... keys (recommended)
 * - LEGACY: JWT-based service_role keys (deprecated but still supported)
 * 
 * According to Supabase docs (https://supabase.com/docs/guides/api/api-keys):
 * - Secret keys provide better security and are easier to rotate
 * - Service role keys are tightly coupled to JWT secret and harder to manage
 * - Both bypass Row Level Security (RLS) - use with caution!
 * 
 * SECURITY WARNING:
 * - NEVER expose these keys in client-side code
 * - Only use in server-side scripts, Edge Functions, or secure backends
 * - These keys bypass ALL Row Level Security policies
 */

const { createClient } = require('@supabase/supabase-js');

/**
 * Get the admin key with priority: secret key > service_role key
 * Supports both new sb_secret_... format and legacy JWT-based service_role key
 */
function getAdminKey(prefix = '') {
  const secretKeyVar = prefix ? `${prefix}_SECRET_KEY` : 'SUPABASE_SECRET_KEY';
  const serviceRoleKeyVar = prefix ? `${prefix}_SERVICE_KEY` : 'SUPABASE_SERVICE_ROLE_KEY';
  
  const secretKey = process.env[secretKeyVar];
  const serviceRoleKey = process.env[serviceRoleKeyVar];
  
  if (secretKey && secretKey.startsWith('sb_secret_')) {
    console.log(`✅ Using NEW ${prefix || 'Supabase'} Secret Key (sb_secret_...)`);
    return secretKey;
  }
  
  if (serviceRoleKey) {
    console.log(`⚠️  Using LEGACY ${prefix || 'Supabase'} Service Role Key (JWT-based)`);
    console.log('💡 Consider migrating to sb_secret_... keys for better security and easier rotation');
    return serviceRoleKey;
  }
  
  throw new Error(
    `Missing ${prefix || 'Supabase'} admin key! Please set either:\n` +
    `  - ${secretKeyVar} (recommended, sb_secret_...)\n` +
    `  - ${serviceRoleKeyVar} (legacy, JWT-based)`
  );
}

/**
 * Admin Supabase client for stripe-guardian's own database
 */
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  getAdminKey(),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'stripe-guardian-admin',
      },
    },
  }
);

/**
 * Admin Supabase client for wiznote (main app) database
 */
const wiznoteAdmin = createClient(
  process.env.WIZNOTE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  getAdminKey('WIZNOTE_SUPABASE'),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'stripe-guardian-wiznote-admin',
      },
    },
  }
);

/**
 * Helper to check which key type is being used
 */
function getAdminKeyInfo(prefix = '') {
  const secretKeyVar = prefix ? `${prefix}_SECRET_KEY` : 'SUPABASE_SECRET_KEY';
  const serviceRoleKeyVar = prefix ? `${prefix}_SERVICE_KEY` : 'SUPABASE_SERVICE_ROLE_KEY';
  
  const secretKey = process.env[secretKeyVar];
  const serviceRoleKey = process.env[serviceRoleKeyVar];
  
  return {
    hasSecretKey: !!secretKey && secretKey.startsWith('sb_secret_'),
    hasServiceRoleKey: !!serviceRoleKey,
    usingNewFormat: !!secretKey && secretKey.startsWith('sb_secret_'),
    keyType: secretKey && secretKey.startsWith('sb_secret_') 
      ? 'secret' 
      : (serviceRoleKey ? 'service_role' : 'none'),
  };
}

/**
 * Validate that admin key is available
 */
function validateAdminKey(prefix = '') {
  try {
    getAdminKey(prefix);
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  supabaseAdmin,
  wiznoteAdmin,
  getAdminKey,
  getAdminKeyInfo,
  validateAdminKey,
};

