# Supabase API Key Migration Guide - Stripe Guardian

## Overview
Supabase has introduced new **Secret Keys** (`sb_secret_...`) to replace the legacy JWT-based service role keys. This guide helps you migrate stripe-guardian to use the new, more secure key format.

## Why Migrate?

According to [Supabase documentation](https://supabase.com/docs/guides/api/api-keys), the new secret keys provide:

- ✅ **Easier rotation** - Change keys without downtime
- ✅ **Individual revocation** - Revoke specific keys if compromised
- ✅ **Not tied to JWT secret** - Independent from auth system
- ✅ **Browser detection** - Won't work in browsers (security feature)
- ✅ **Better audit trail** - Track which key was used

### Problems with Legacy Service Role Keys

- ❌ **Coupled to JWT secret** - Rotating JWT secret affects all keys
- ❌ **10-year expiry** - Long-lived tokens are security risks
- ❌ **Cannot rotate independently** - All or nothing approach
- ❌ **Problematic for mobile apps** - App store delays make rotation difficult

## Key Types

### Secret Key (NEW ✅ - Server Side)
- **Format:** `sb_secret_...`
- **Environment Variables:** 
  - `SUPABASE_SECRET_KEY` (for stripe-guardian's own database)
  - `WIZNOTE_SUPABASE_SECRET_KEY` (for wiznote user_profiles)
- **Safe to expose:** ❌ **NEVER!** Server-side only!
- **Protected by:** Nothing - bypasses ALL Row Level Security
- **Use for:** Webhook handlers, API endpoints, scripts

### Service Role Key (LEGACY - Server Side)
- **Format:** `eyJhbGc...` (JWT token)
- **Environment Variables:**
  - `SUPABASE_SERVICE_ROLE_KEY` (legacy)
  - `WIZNOTE_SUPABASE_SERVICE_KEY` (legacy)
- **Status:** ⚠️ Still works but not recommended

## Migration Steps

### Step 1: Get Your New Secret Keys

1. **For stripe-guardian's database:**
   - Go to [Supabase Dashboard](https://supabase.com/dashboard)
   - Select your stripe-guardian project
   - Navigate to **Settings** → **API**
   - Copy your **Secret key** (starts with `sb_secret_`)

2. **For wiznote database:**
   - Go to [Supabase Dashboard](https://supabase.com/dashboard)
   - Select your wiznote project
   - Navigate to **Settings** → **API**
   - Copy your **Secret key** (starts with `sb_secret_`)

### Step 2: Update Environment Variables

Update your `.env` file or environment variables on your hosting platform (Render, Vercel, etc.):

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Stripe-Guardian's Database (NEW format)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_your_secret_key_here
# Legacy (keep for now, remove after testing)
SUPABASE_SERVICE_ROLE_KEY=your-legacy-service-role-key

# Wiznote Database (NEW format)
WIZNOTE_SUPABASE_URL=https://your-wiznote-project.supabase.co
WIZNOTE_SUPABASE_SECRET_KEY=sb_secret_your_wiznote_secret_key_here
# Legacy (keep for now, remove after testing)
WIZNOTE_SUPABASE_SERVICE_KEY=your-legacy-wiznote-service-key
```

### Step 3: The Code Already Supports Both!

The stripe-guardian codebase has been updated with `server/lib/supabase-admin.js` that automatically:
1. Tries to use the new `sb_secret_...` key first
2. Falls back to legacy `service_role` key if new key isn't available
3. Logs which key type is being used

```javascript
// Example: Using the admin client
const { supabaseAdmin, wiznoteAdmin } = require('./server/lib/supabase-admin');

// supabaseAdmin - for stripe-guardian's database
// wiznoteAdmin - for wiznote's user_profiles
```

### Step 4: Test Everything

1. Add both new and legacy keys to your `.env`
2. Deploy to staging/development environment
3. Test all webhook handlers
4. Test all API endpoints
5. Check logs to verify new keys are being used
6. Monitor for any errors

### Step 5: Remove Legacy Keys (After Verification)

Once you've verified everything works with the new keys:
1. Remove or comment out the legacy `SUPABASE_SERVICE_ROLE_KEY` variables
2. Deploy to production
3. Monitor for 24-48 hours
4. If no issues, permanently delete legacy keys from Supabase dashboard

## Security Best Practices

### ✅ DO:
- Use **Secret Keys** (`sb_secret_...`) for all server-side operations
- Keep secret keys in environment variables (never commit to git)
- Use separate secret keys for different services/environments
- Rotate keys regularly (now much easier!)
- Log only first 6 characters of keys if needed for debugging

### ❌ DON'T:
- Never commit secret keys to git
- Never use secret keys in client-side code
- Never use secret keys in browsers (even localhost!)
- Never share keys via chat, email, or SMS
- Never log full API keys
- Never pass keys in URLs or query params

## Migration Strategy

### Zero-Downtime Migration

1. **Phase 1: Add new keys** (Both keys active)
   - Add `SUPABASE_SECRET_KEY` alongside `SUPABASE_SERVICE_ROLE_KEY`
   - Add `WIZNOTE_SUPABASE_SECRET_KEY` alongside `WIZNOTE_SUPABASE_SERVICE_KEY`
   - Deploy to production

2. **Phase 2: Verify** (Both keys active)
   - Monitor logs for "✅ Using NEW Supabase Secret Key" messages
   - Test all webhook handlers
   - Test all API endpoints
   - Verify no errors for 24-48 hours

3. **Phase 3: Remove legacy keys** (Only new keys)
   - Remove `SUPABASE_SERVICE_ROLE_KEY` from environment
   - Remove `WIZNOTE_SUPABASE_SERVICE_KEY` from environment
   - Deploy to production
   - Monitor for another 24-48 hours

4. **Phase 4: Clean up** (Complete)
   - Delete legacy keys from Supabase dashboard if desired
   - Update documentation
   - Remove fallback code if desired (optional)

## Deployment Checklist

### Render
```bash
# Add new environment variables in Render dashboard
SUPABASE_SECRET_KEY=sb_secret_...
WIZNOTE_SUPABASE_SECRET_KEY=sb_secret_...
```

### Vercel
```bash
# Add via Vercel dashboard or CLI
vercel env add SUPABASE_SECRET_KEY production
vercel env add WIZNOTE_SUPABASE_SECRET_KEY production
```

### Docker / Docker Compose
```yaml
environment:
  - SUPABASE_SECRET_KEY=sb_secret_...
  - WIZNOTE_SUPABASE_SECRET_KEY=sb_secret_...
```

## Files Updated

- ✅ `server/lib/supabase-admin.js` - NEW! Admin client with dual key support
- ✅ `env-template.txt` - Updated with new secret key format
- ✅ `SUPABASE_API_KEY_MIGRATION.md` - This guide

## Affected Components

All server-side code will automatically use new keys when available:

### API Endpoints
- `api/stripe/webhook.js`
- `api/stripe/create-checkout.js`
- `api/stripe/create-paymentsheet.js`
- `api/stripe/confirm-paymentsheet.js`
- `api/stripe/cancel-subscription.js`
- `api/stripe/reactivate-subscription.js`
- `api/stripe/verify-session.js`
- `api/stripe/sync-plan.js`

### Services
- `services/subscription-sync.js`
- `server/webhook-server.js`

### Scripts
- `scripts/test-db-query.js`
- `scripts/stripe-health-check.js`
- `scripts/auto-stripe-guardian.js`

## Troubleshooting

### "Missing Supabase admin key" Error
- Ensure at least one key is set: `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- Check environment variables are loaded correctly
- Verify `.env` file is in correct location

### Still Using Legacy Keys
- Check logs for "⚠️ Using LEGACY Service Role Key" message
- Verify `SUPABASE_SECRET_KEY` starts with `sb_secret_`
- Ensure environment variables are reloaded after changes

### Key Not Working
- Verify key was copied correctly (no extra spaces)
- Check key is for correct Supabase project
- Ensure key hasn't been revoked in Supabase dashboard

## Need Help?

- [Supabase API Settings](https://supabase.com/dashboard/project/_/settings/api)
- [Supabase API Keys Documentation](https://supabase.com/docs/guides/api/api-keys)
- [Stripe Guardian Documentation](./README.md)

