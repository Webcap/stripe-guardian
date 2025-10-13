# Deployment Checklist - Stripe Guardian Fixes

## ✅ What Was Fixed
1. **Webhook handler error** - Fixed "handler is not a function" error
2. **Automatic subscription sync** - Added built-in subscription checking every 10 minutes

## 🚀 Deployment Steps

### Step 1: Verify Changes Locally (Optional)
```bash
cd C:\Users\cnieves\Desktop\Projects\stripe-guardian

# Test the server starts correctly
node server.js

# You should see:
# 🚀 Stripe Guardian API Server running on port 8080
# 📍 Health check: http://localhost:8080/api/health
# 📍 Ready check: http://localhost:8080/api/ready
# 🔄 Starting automatic subscription sync...
# 📊 Sync interval: 10 minutes
```

### Step 2: Deploy to Production
Depending on your deployment platform:

#### Docker/Cloud Platform:
```bash
# Commit changes
git add .
git commit -m "Fix webhook handler and add automatic subscription sync"
git push

# Your cloud platform will auto-deploy
# Or manually rebuild/redeploy your container
```

#### Manual Server:
```bash
# SSH to your server
ssh your-server

# Pull latest changes
cd /path/to/stripe-guardian
git pull

# Restart the service
pm2 restart stripe-guardian
# OR
systemctl restart stripe-guardian
# OR
# Just restart the process however you normally do
```

### Step 3: Verify Deployment

#### 3.1 Check Server is Running
```bash
curl https://your-domain.com/api/health

# Should return:
# {"ok":true,"timestamp":"...","service":"Stripe Guardian","status":"healthy"}
```

#### 3.2 Check Subscription Sync is Active
```bash
curl https://your-domain.com/api/sync-status

# Should return:
# {
#   "ok": true,
#   "sync": {
#     "isRunning": true,
#     "lastSyncTime": "2025-10-13T...",
#     "syncCount": 1,
#     "intervalMinutes": 10
#   }
# }
```

#### 3.3 Test Webhook (from Stripe Dashboard)
1. Go to Stripe Dashboard → Developers → Webhooks
2. Click on your webhook endpoint
3. Click "Send test webhook"
4. Select "checkout.session.completed"
5. Send the test

**Expected**: Success response (no more "handler is not a function" error)

#### 3.4 Monitor Logs
Watch your server logs for:
```
POST /api/stripe/webhook
Handling webhook event: checkout.session.completed
✅ Webhook processed successfully

🔄 [Sync #2] Starting subscription sync at ...
   🔍 Found X active subscriptions in Stripe
✅ [Sync #2] Completed in XXXms
```

### Step 4: Set Up Monitoring (Recommended)

#### Add Health Check Monitoring
Set up monitoring to check these endpoints every 5 minutes:
- `GET /api/health` - Should return 200
- `GET /api/ready` - Should return 200 with all checks passing
- `GET /api/sync-status` - Should show `isRunning: true`

#### Alert Conditions
Create alerts for:
1. Health check failures (> 2 consecutive failures)
2. Sync not running (`isRunning: false`)
3. Last sync time > 15 minutes ago
4. Webhook processing errors in logs

## 🧪 Testing Checklist

- [ ] Server starts without errors
- [ ] Health endpoint returns 200
- [ ] Ready endpoint includes subscription sync status
- [ ] Sync status endpoint shows running sync
- [ ] Manual sync trigger works (`POST /api/sync-status`)
- [ ] Webhook test from Stripe succeeds
- [ ] Logs show periodic sync operations
- [ ] No "handler is not a function" errors

## 📊 What to Monitor

### First Hour After Deployment
Watch for:
- ✅ Initial sync completes successfully
- ✅ Periodic syncs run every 10 minutes
- ✅ Webhook events process correctly
- ✅ No errors in logs

### First 24 Hours
Monitor:
- Sync success rate (should be ~100%)
- Webhook processing success rate
- Number of subscriptions synced
- Any expired/canceled subscriptions detected

### Ongoing
- Weekly review of sync logs
- Monthly review of webhook success rate
- Alert on any failures

## 🔧 Troubleshooting

### Sync Not Starting
```bash
# Check environment variables are set
curl https://your-domain.com/api/ready

# Look for:
"checks": {
  "env": {
    "STRIPE_SECRET_KEY": true,
    "SUPABASE_URL": true
  }
}

# If any are false, set the missing env vars and restart
```

### Webhook Still Failing
```bash
# Check the error in logs
# Verify STRIPE_WEBHOOK_SECRET is set correctly
# Test with Stripe CLI:
stripe listen --forward-to https://your-domain.com/api/stripe/webhook
stripe trigger checkout.session.completed
```

### Sync Running But No Updates
```bash
# Trigger manual sync and watch logs
curl -X POST https://your-domain.com/api/sync-status

# Check logs for errors
# Verify Supabase permissions
# Check if subscriptions exist in Stripe
```

## 📝 Documentation

For more details, see:
- `FIXES_SUMMARY.md` - Complete overview of fixes
- `WEBHOOK_HANDLER_FIX.md` - Webhook fix details
- `AUTOMATIC_SUBSCRIPTION_SYNC.md` - Sync system documentation
- `README.md` - Updated features and endpoints

## 🎉 Success Indicators

You'll know everything is working when:
1. ✅ No webhook errors in logs
2. ✅ Sync runs every 10 minutes
3. ✅ Subscription statuses update correctly
4. ✅ `/api/sync-status` shows healthy status
5. ✅ Zero manual intervention needed

## 📞 Next Steps After Deployment

1. **Monitor for 24 hours** - Watch logs and endpoints
2. **Test a real subscription** - Create a test subscription and verify it syncs
3. **Test cancellation** - Cancel a subscription and verify it updates
4. **Document your deployment** - Note any platform-specific steps
5. **Set up alerts** - Configure monitoring alerts

---

## Quick Command Reference

```bash
# Check health
curl https://your-domain.com/api/health

# Check ready status (includes sync info)
curl https://your-domain.com/api/ready

# Check sync status
curl https://your-domain.com/api/sync-status

# Trigger manual sync
curl -X POST https://your-domain.com/api/sync-status

# Test webhook (Stripe CLI)
stripe trigger checkout.session.completed
```

---

**You're all set!** Deploy when ready and monitor the endpoints above. 🚀

