# Supabase Database Connection Fix

## Problem

The Stripe Guardian API endpoints were incorrectly connecting to the local Supabase instance instead of the Wiznote app's Supabase database. This caused **"Database error while checking user"** errors when trying to create payment sheets and process subscriptions.

### Root Cause

All Stripe API endpoints were using:
- `process.env.SUPABASE_URL` 
- `process.env.SUPABASE_SERVICE_ROLE_KEY`

But these should connect to the **Wiznote** database to access:
- `user_profiles` table
- `premium_plans` table

## Solution

Updated all 12 Stripe Guardian API files to use the `wiznoteAdmin` client from `server/lib/supabase-admin.js`, which correctly connects to the Wiznote Supabase database using:
- `process.env.WIZNOTE_SUPABASE_URL`
- `process.env.WIZNOTE_SUPABASE_SECRET_KEY` (or `WIZNOTE_SUPABASE_SERVICE_KEY`)

## Files Fixed

1. ✅ `api/stripe/create-paymentsheet.js` - Creates payment sheets for mobile subscriptions
2. ✅ `api/stripe/confirm-paymentsheet.js` - Confirms payments and creates subscriptions
3. ✅ `api/stripe/cancel-subscription.js` - Cancels user subscriptions
4. ✅ `api/stripe/reactivate-subscription.js` - Reactivates cancelled subscriptions
5. ✅ `api/stripe/get-billing-history.js` - Retrieves billing history
6. ✅ `api/stripe/create-customer.js` - Creates Stripe customers
7. ✅ `api/stripe/create-checkout.js` - Creates checkout sessions
8. ✅ `api/stripe/verify-session.js` - Verifies checkout sessions
9. ✅ `api/stripe/sync-plan.js` - Syncs plans with Stripe
10. ✅ `api/stripe/webhook.js` - Handles Stripe webhooks
11. ✅ `api/webhook.js` - Main webhook handler
12. ✅ `api/ready.js` - Health check endpoint

## Required Environment Variables

Ensure your Stripe Guardian service has these environment variables configured:

### Stripe Configuration
```env
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_PUBLISHABLE_KEY=pk_live_your_publishable_key  # or EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY
```

### Wiznote Supabase Configuration (REQUIRED)
```env
# NEW: Secret key format (recommended)
WIZNOTE_SUPABASE_URL=https://your-wiznote-project.supabase.co
WIZNOTE_SUPABASE_SECRET_KEY=sb_secret_your_wiznote_secret_key_here

# OR LEGACY: JWT-based service role key (still supported)
WIZNOTE_SUPABASE_URL=https://your-wiznote-project.supabase.co
WIZNOTE_SUPABASE_SERVICE_KEY=your-wiznote-service-role-key
```

### Local Supabase Configuration (Optional - for Stripe Guardian's own data)
```env
SUPABASE_URL=https://your-stripe-guardian-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_your_stripe_guardian_secret_key
```

## Deployment Steps

### 1. Set Environment Variables

#### For Render.com
```bash
# Navigate to your Stripe Guardian service in Render dashboard
# Go to Environment → Add Environment Variable

WIZNOTE_SUPABASE_URL=https://your-wiznote-project.supabase.co
WIZNOTE_SUPABASE_SECRET_KEY=sb_secret_your_wiznote_secret_key_here
```

#### For Vercel
```bash
vercel env add WIZNOTE_SUPABASE_URL production
# Enter: https://your-wiznote-project.supabase.co

vercel env add WIZNOTE_SUPABASE_SECRET_KEY production
# Enter: sb_secret_your_wiznote_secret_key_here
```

#### For Docker
Update your `docker-compose.yml` or `.env` file:
```yaml
environment:
  - WIZNOTE_SUPABASE_URL=${WIZNOTE_SUPABASE_URL}
  - WIZNOTE_SUPABASE_SECRET_KEY=${WIZNOTE_SUPABASE_SECRET_KEY}
```

### 2. Deploy the Changes

```bash
# Commit the changes
git add .
git commit -m "Fix: Use wiznoteAdmin for all Stripe API database operations"

# Push to your deployment branch
git push origin main  # or your deployment branch
```

### 3. Verify the Fix

After deployment, test the payment flow:

1. **Check Health Endpoint**
   ```bash
   curl https://your-stripe-guardian.onrender.com/ready
   ```
   Should return `"supabase": true`

2. **Test Payment Sheet Creation** (from mobile app)
   - Navigate to subscription page
   - Try to subscribe to a premium plan
   - Should no longer see "Database error while checking user"

3. **Check Logs**
   Look for these success messages:
   ```
   ✅ Using NEW WIZNOTE_SUPABASE Secret Key (sb_secret_...)
   Wiznote Supabase client initialized from supabase-admin module
   ```

## Troubleshooting

### Error: "Service not properly initialized"
**Cause:** Missing environment variables

**Solution:**
1. Verify `WIZNOTE_SUPABASE_URL` is set
2. Verify either `WIZNOTE_SUPABASE_SECRET_KEY` or `WIZNOTE_SUPABASE_SERVICE_KEY` is set
3. Restart your service after setting environment variables

### Error: "No rows found" or "PGRST116"
**Cause:** User profile doesn't exist in database

**Solution:**
1. Ensure user has signed up properly
2. Check `user_profiles` table in Supabase dashboard
3. Verify user authentication is working

### Error: "Invalid API key"
**Cause:** Wrong Supabase credentials

**Solution:**
1. Verify you're using the **Wiznote** Supabase credentials, not Stripe Guardian's
2. Get credentials from: Supabase Dashboard → Project Settings → API
3. Use the **service_role** key or **secret** key

## Migration Checklist

- [x] Update all 12 Stripe API files to use `wiznoteAdmin`
- [ ] Set `WIZNOTE_SUPABASE_URL` environment variable
- [ ] Set `WIZNOTE_SUPABASE_SECRET_KEY` or `WIZNOTE_SUPABASE_SERVICE_KEY`
- [ ] Deploy changes to production
- [ ] Verify health check endpoint
- [ ] Test payment flow end-to-end
- [ ] Monitor logs for any remaining errors

## Benefits

✅ **Correct Database Access** - All endpoints now connect to the right database
✅ **Consistent Configuration** - All files use the same `wiznoteAdmin` client
✅ **Better Error Handling** - Proper initialization checking
✅ **Future-Proof** - Supports both new (secret key) and legacy (service_role) formats
✅ **Easier Maintenance** - Centralized database configuration

## Related Files

- `server/lib/supabase-admin.js` - Centralized Supabase client configuration
- `docs/SUPABASE_SECRET_KEYS_SETUP.md` - Detailed setup guide
- `SUPABASE_API_KEY_MIGRATION.md` - Migration guide for secret keys
- `env-template.txt` - Environment variable template

## Next Steps

1. Deploy these changes immediately to fix the payment error
2. Test the payment flow thoroughly
3. Monitor logs for the next 24-48 hours
4. Consider migrating to the new `sb_secret_` format if using legacy keys

---

**Status:** ✅ Fixed and ready for deployment
**Date:** October 18, 2025
**Impact:** Critical - Fixes all payment and subscription operations

