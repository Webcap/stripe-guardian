# 🚨 Quick Fix Summary: Database Connection Error

## What Was Wrong?
❌ **Error:** "Database error while checking user"  
❌ **Cause:** Stripe Guardian was connecting to the wrong Supabase database

## What Was Fixed?
✅ Updated 12 API files to use the correct Wiznote database connection  
✅ All files now use `wiznoteAdmin` client from `server/lib/supabase-admin.js`

## What You Need To Do NOW

### Step 1: Set Environment Variables ⚙️

Your Stripe Guardian service MUST have these set:

```env
WIZNOTE_SUPABASE_URL=https://your-wiznote-project.supabase.co
WIZNOTE_SUPABASE_SECRET_KEY=sb_secret_your_wiznote_key
```

**Where to get these:**
1. Go to your **Wiznote** Supabase project (NOT Stripe Guardian's)
2. Click: Settings → API
3. Copy:
   - `URL` → use as `WIZNOTE_SUPABASE_URL`
   - `service_role secret` → use as `WIZNOTE_SUPABASE_SECRET_KEY`

### Step 2: Deploy 🚀

```bash
git add .
git commit -m "Fix: Connect to correct Wiznote database"
git push origin main
```

### Step 3: Verify ✓

After deployment:
1. Go to: `https://your-stripe-guardian.onrender.com/ready`
2. Check that `"supabase": true`
3. Try subscribing from mobile app - should work now!

## Files Changed
- api/stripe/create-paymentsheet.js
- api/stripe/confirm-paymentsheet.js
- api/stripe/cancel-subscription.js
- api/stripe/reactivate-subscription.js
- api/stripe/get-billing-history.js
- api/stripe/create-customer.js
- api/stripe/create-checkout.js
- api/stripe/verify-session.js
- api/stripe/sync-plan.js
- api/stripe/webhook.js
- api/webhook.js
- api/ready.js

## Quick Test

```bash
# Check if environment variables are set
curl https://your-stripe-guardian.onrender.com/ready

# Should return:
{
  "ok": true,
  "checks": {
    "env": {
      "WIZNOTE_SUPABASE_URL": true,
      "WIZNOTE_SUPABASE_SECRET_KEY": true
    },
    "supabase": true
  }
}
```

## Still Having Issues?

1. **Restart your service** after setting environment variables
2. Check logs for: `"✅ Using NEW WIZNOTE_SUPABASE Secret Key"`
3. Verify you're using **Wiznote's** Supabase credentials, not Stripe Guardian's
4. See full documentation: `SUPABASE_DATABASE_FIX.md`

---

**⏱️ Estimated Time to Fix:** 5-10 minutes  
**🎯 Priority:** CRITICAL - Deploy ASAP

