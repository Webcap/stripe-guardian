# Supabase Secret Keys Setup - Stripe Guardian

## Overview

Stripe Guardian needs access to **two** Supabase projects:
1. **Stripe Guardian's own database** (optional, for logging/analytics)
2. **Wiznote's database** (required, for updating user subscriptions)

This guide shows you how to get the new `sb_secret_...` keys for both.

## Prerequisites

- Access to Supabase dashboard for both projects
- Admin/Owner permissions on both Supabase projects

## Getting Your Keys

### Part 1: Wiznote Database Keys (Required)

These keys allow Stripe Guardian to update subscription data in your main app's database.

1. **Access Wiznote Supabase Project**
   - Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
   - Select your **Wiznote** project

2. **Navigate to API Settings**
   - Click **Settings** (⚙️) → **API**

3. **Copy Secret Key**
   - Find **Secret key (service_role)**
   - Format: `sb_secret_...`
   - Click to copy

4. **Add to Environment Variables**
   ```bash
   WIZNOTE_SUPABASE_URL=https://your-wiznote-project.supabase.co
   WIZNOTE_SUPABASE_SECRET_KEY=sb_secret_your_wiznote_key_here
   ```

### Part 2: Stripe Guardian Database Keys (Optional)

These keys are for Stripe Guardian's own database (if you have one).

1. **Access Stripe Guardian Supabase Project**
   - Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
   - Select your **Stripe Guardian** project (if separate from Wiznote)

2. **Navigate to API Settings**
   - Click **Settings** (⚙️) → **API**

3. **Copy Secret Key**
   - Find **Secret key (service_role)**
   - Format: `sb_secret_...`
   - Click to copy

4. **Add to Environment Variables**
   ```bash
   SUPABASE_URL=https://your-stripe-guardian-project.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_your_stripe_guardian_key_here
   ```

## Complete Environment Setup

Your complete `.env` file should look like this:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Wiznote Database (REQUIRED)
WIZNOTE_SUPABASE_URL=https://wiznote-project.supabase.co
WIZNOTE_SUPABASE_SECRET_KEY=sb_secret_wiznote_key_here
# Legacy fallback (can remove after migration)
WIZNOTE_SUPABASE_SERVICE_KEY=eyJ...

# Stripe Guardian Database (OPTIONAL)
SUPABASE_URL=https://stripe-guardian-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_stripe_guardian_key_here
# Legacy fallback (can remove after migration)
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## Deployment to Hosting Platforms

### Render

1. Go to your Stripe Guardian service on Render
2. Click **Environment** tab
3. Add environment variables:
   ```
   WIZNOTE_SUPABASE_URL
   WIZNOTE_SUPABASE_SECRET_KEY
   SUPABASE_URL (if using)
   SUPABASE_SECRET_KEY (if using)
   ```
4. Click **Save Changes**
5. Service will automatically redeploy

### Vercel

```bash
# Add via CLI
vercel env add WIZNOTE_SUPABASE_URL production
vercel env add WIZNOTE_SUPABASE_SECRET_KEY production

# Or via dashboard:
# Settings → Environment Variables → Add New
```

### Docker / Docker Compose

Update `docker-compose.yml`:

```yaml
environment:
  - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
  - STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
  - WIZNOTE_SUPABASE_URL=${WIZNOTE_SUPABASE_URL}
  - WIZNOTE_SUPABASE_SECRET_KEY=${WIZNOTE_SUPABASE_SECRET_KEY}
  - SUPABASE_URL=${SUPABASE_URL}
  - SUPABASE_SECRET_KEY=${SUPABASE_SECRET_KEY}
```

## Testing Your Setup

Run the example script to verify keys are working:

```bash
node scripts/example-admin-usage.js
```

Expected output:
```
✅ Using NEW Wiznote Supabase Secret Key (sb_secret_...)
✅ Using NEW Supabase Secret Key (sb_secret_...)
✅ Both admin keys validated successfully!
```

## Security Checklist

### ✅ Required Steps
- [ ] `.env` file is in `.gitignore`
- [ ] Never commit secret keys to git
- [ ] Secret keys are only in server-side code
- [ ] Production keys are in hosting platform environment variables
- [ ] Test keys before removing legacy keys

### ⚠️ Common Security Mistakes

❌ **DON'T:**
- Commit `.env` to git
- Use secret keys in client-side code
- Share keys via email/chat
- Log full keys in application logs
- Use production keys in development

✅ **DO:**
- Use environment variables
- Keep keys server-side only
- Rotate keys regularly (now easier with new format!)
- Use separate keys for dev/staging/production
- Monitor key usage in logs

## Key Differences: New vs Legacy

| Aspect | New Secret Keys | Legacy Service Role |
|--------|----------------|---------------------|
| Format | `sb_secret_...` | `eyJhbGc...` (JWT) |
| Rotation | Easy, no downtime | Hard, requires JWT secret rotation |
| Revocation | Individual key | All keys at once |
| Expiry | Managed by Supabase | 10 years (security risk) |
| Browser Detection | Won't work in browsers | Works anywhere (risk) |

## Troubleshooting

### "Missing Supabase admin key" Error

**Problem:** Application can't find the secret key

**Solution:**
1. Verify environment variable names are correct:
   - `WIZNOTE_SUPABASE_SECRET_KEY` (not `WIZNOTE_SECRET_KEY`)
   - `SUPABASE_SECRET_KEY` (not `STRIPE_GUARDIAN_SECRET_KEY`)
2. Check `.env` file is in the correct location (project root)
3. Restart your application after changing `.env`

### "Still using legacy key" Warning

**Problem:** Application is using old JWT-based service_role key

**Solution:**
1. Verify new key starts with `sb_secret_`
2. Check environment variable is loaded: `console.log(process.env.SUPABASE_SECRET_KEY)`
3. Ensure new key is set (not just legacy key)

### Keys Not Working After Deployment

**Problem:** Works locally but not in production

**Solution:**
1. Verify environment variables are set on hosting platform
2. Check variable names match exactly (case-sensitive)
3. Redeploy after adding environment variables
4. Check platform-specific logs for errors

## Migration Path

### Safe Migration (Zero Downtime)

```mermaid
graph LR
    A[Using Legacy Keys] --> B[Add New Keys]
    B --> C[Deploy with Both]
    C --> D[Verify New Keys Work]
    D --> E[Remove Legacy Keys]
    E --> F[Using New Keys Only]
```

**Timeline:**
1. **Day 1:** Add new keys alongside legacy keys, deploy
2. **Day 2-3:** Monitor logs, verify "Using NEW" messages
3. **Day 4:** Remove legacy keys, deploy
4. **Day 5+:** Monitor for any issues

### Rollback Plan

If issues occur:
1. Re-add legacy environment variables
2. Redeploy
3. Application will automatically fall back to legacy keys

## Visual Guide

```
┌─────────────────────────────────────────┐
│ Stripe Guardian Environment Setup      │
├─────────────────────────────────────────┤
│                                         │
│ Stripe APIs                             │
│ ├── STRIPE_SECRET_KEY                   │
│ └── STRIPE_WEBHOOK_SECRET               │
│                                         │
│ Wiznote Database (Main App)            │
│ ├── WIZNOTE_SUPABASE_URL                │
│ └── WIZNOTE_SUPABASE_SECRET_KEY ⭐      │
│                                         │
│ Stripe Guardian Database (Optional)     │
│ ├── SUPABASE_URL                        │
│ └── SUPABASE_SECRET_KEY ⭐              │
│                                         │
└─────────────────────────────────────────┘

⭐ = New sb_secret_... format
```

## Next Steps

1. ✅ Get secret keys from Supabase dashboard (both projects)
2. ✅ Add to `.env` file locally
3. ✅ Test with `node scripts/example-admin-usage.js`
4. ✅ Add to hosting platform environment variables
5. ✅ Deploy to production
6. ✅ Monitor logs for "✅ Using NEW" messages
7. ✅ Remove legacy keys after verification

## Related Documentation

- [Migration Guide](./SUPABASE_API_KEY_MIGRATION.md)
- [Stripe Guardian README](../README.md)
- [Supabase API Keys Docs](https://supabase.com/docs/guides/api/api-keys)

## Need Help?

Check these resources:
- [Supabase Dashboard](https://supabase.com/dashboard)
- [Supabase Support](https://supabase.com/support)
- Project README and deployment docs

