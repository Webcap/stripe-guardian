# Stripe Guardian Deployment Information

## Hosting Platform

**Platform:** Starlight Hyperlift  
**API URL:** https://api.webcap.media

## Current Status

✅ **API Keys**: Using **NEW format** (not legacy)  
✅ **Deployment**: Auto-deploys from `main` branch

## Environment Variables

The following environment variables are configured on Starlight Hyperlift:

### Stripe Configuration
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
```

### Wiznote Supabase (Main App Database)
```
WIZNOTE_SUPABASE_URL=https://your-wiznote-project.supabase.co
WIZNOTE_SUPABASE_SERVICE_KEY=<service_role key>
```
**Note:** Using NEW API key format (not legacy `eyJ...` format)

### Local Stripe Guardian Supabase (Optional - for Guardian's own data)
```
SUPABASE_URL=https://your-stripe-guardian-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

### Other
```
NODE_ENV=production
WEBHOOK_PORT=8080
```

## Deployment Process

1. **Commit changes** to the repository
   ```bash
   git add .
   git commit -m "Your commit message"
   git push origin main
   ```

2. **Auto-deploy** triggers on Starlight Hyperlift from the `main` branch

3. **Dockerfile** builds the image with:
   - `api/` directory
   - `server/` directory (includes `server/lib/supabase-admin.js`)
   - `services/` directory
   - `server.js` entry point

## Important Files

### Dockerfile
- Located at root: `Dockerfile`
- Builds Node.js 20 Alpine image
- Copies `api/`, `server/`, `services/`, and `server.js`
- Runs on port 8080
- Health check: `/api/health`

### Entry Point
- `server.js` - Main server file
- Auto-loads routes from `api/` directory

### Supabase Admin Module
- `server/lib/supabase-admin.js` - Centralized Supabase client configuration
- Exports `wiznoteAdmin` and `supabaseAdmin` clients
- Supports both new secret keys (`sb_secret_...`) and legacy service_role keys

## API Endpoints

- **Health Check:** `https://api.webcap.media/api/health`
- **Ready Check:** `https://api.webcap.media/api/ready`
- **Sync Status:** `https://api.webcap.media/api/sync-status`

### Stripe Endpoints
- `/api/stripe/create-paymentsheet` - Creates payment sheet for mobile
- `/api/stripe/confirm-paymentsheet` - Confirms payment and creates subscription
- `/api/stripe/create-checkout` - Creates Stripe checkout session
- `/api/stripe/verify-session` - Verifies checkout session
- `/api/stripe/cancel-subscription` - Cancels subscription
- `/api/stripe/reactivate-subscription` - Reactivates subscription
- `/api/stripe/get-billing-history` - Gets billing history
- `/api/stripe/webhook` - Stripe webhook handler
- `/api/stripe/sync-plan` - Syncs plan with Stripe

## Troubleshooting

### "Cannot find module" errors
- **Cause:** `server/` directory not included in Dockerfile
- **Fix:** Ensure Dockerfile has `COPY server/ ./server/`

### "Legacy API keys are disabled" errors
- **Cause:** Using old Supabase API key format
- **Fix:** Update to new service_role keys from Supabase dashboard

### Module not found: '../server/lib/supabase-admin'
- **Cause:** Deployment didn't include `server/lib/supabase-admin.js`
- **Fix:** Verify Dockerfile copies `server/` directory

### Database connection errors
- **Cause:** Wrong Supabase credentials or connecting to wrong database
- **Fix:** 
  - Use `WIZNOTE_SUPABASE_*` vars for user_profiles and premium_plans
  - All API endpoints should use `wiznoteAdmin` client

## Recent Fixes

### October 18, 2025
- ✅ Fixed Dockerfile to include `server/` directory
- ✅ Updated all API endpoints to use `wiznoteAdmin` from `server/lib/supabase-admin.js`
- ✅ Centralized Supabase client configuration
- ✅ Fixed database connection to use correct Wiznote database

## Access & Credentials

**Platform:** Starlight Hyperlift  
**Repository:** https://github.com/Webcap/stripe-guardian  
**Branch:** `main` (auto-deploys)

## Notes

- All Stripe API endpoints connect to the **Wiznote** Supabase database (not a local Guardian database)
- The `user_profiles` and `premium_plans` tables are in the Wiznote database
- API keys are in the NEW format (not legacy)
- Server runs on port 8080 inside container
- Automatic subscription sync runs every 60 minutes

