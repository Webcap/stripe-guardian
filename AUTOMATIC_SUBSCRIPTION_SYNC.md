# Automatic Subscription Sync Implementation

## Overview
Stripe Guardian now includes automatic subscription checking and synchronization built directly into the main server. This ensures subscription statuses are always up-to-date without requiring a separate process.

## What Was Added

### 1. Subscription Sync Service (`services/subscription-sync.js`)
A dedicated service that:
- ✅ **Syncs active subscriptions** from Stripe to the database
- ✅ **Checks for expired subscriptions** and deactivates them
- ✅ **Syncs canceled subscriptions** from Stripe
- ✅ **Runs automatically** every 10 minutes (configurable)
- ✅ **Verifies with Stripe** before making database changes

### 2. Automatic Startup
The subscription sync service starts automatically when the server starts:
- Runs initial sync immediately on startup
- Sets up periodic sync every 10 minutes
- Gracefully stops when server shuts down

### 3. New API Endpoints

#### `GET /api/sync-status`
Returns the current status of the subscription sync service:
```json
{
  "ok": true,
  "sync": {
    "isRunning": true,
    "lastSyncTime": "2025-10-13T10:00:00.000Z",
    "syncCount": 5,
    "intervalMinutes": 10
  },
  "timestamp": "2025-10-13T10:00:00.000Z"
}
```

#### `POST /api/sync-status`
Manually triggers a subscription sync (useful for testing or forcing an immediate update):
```bash
curl -X POST http://localhost:8080/api/sync-status
```

Response:
```json
{
  "ok": true,
  "message": "Sync triggered",
  "timestamp": "2025-10-13T10:00:00.000Z"
}
```

### 4. Enhanced Ready Check
The `/api/ready` endpoint now includes subscription sync status:
```json
{
  "ok": true,
  "timestamp": "2025-10-13T10:00:00.000Z",
  "service": "Stripe Guardian",
  "uptime": 3600,
  "checks": {
    "env": { ... },
    "stripe": true,
    "supabase": true
  },
  "subscriptionSync": {
    "isRunning": true,
    "lastSyncTime": "2025-10-13T10:00:00.000Z",
    "syncCount": 5,
    "intervalMinutes": 10
  }
}
```

## How It Works

### Sync Process
Every 10 minutes, the service performs three checks:

#### 1. Sync Active Subscriptions
- Fetches active subscriptions from Stripe
- Finds corresponding users in the database
- Updates their premium status if out of sync
- Logs each sync operation

#### 2. Check Expired Subscriptions
- Finds users with expired `currentPeriodEnd` dates
- Verifies with Stripe before deactivating
- Only deactivates if Stripe confirms the subscription is not active
- Prevents false positives

#### 3. Sync Canceled Subscriptions
- Fetches canceled subscriptions from Stripe
- Updates database records that still show them as active
- Marks subscriptions with `isActive: false` and `status: 'canceled'`

### Console Output
During sync operations, you'll see detailed logs:
```
🔄 [Sync #1] Starting subscription sync at 2025-10-13T10:00:00.000Z
   🔍 Found 5 active subscriptions in Stripe
   ✅ Synced subscription sub_xxx for user user-123
   ⏰ Deactivated expired subscription for user user-456
   🔍 Found 2 canceled subscriptions in Stripe
✅ [Sync #1] Completed in 1234ms
   📈 Active: 5 | 📉 Expired: 1 | ❌ Canceled: 2
```

## Configuration

You can customize sync intervals by modifying `services/subscription-sync.js`:

```javascript
this.config = {
  syncIntervalMs: 10 * 60 * 1000, // 10 minutes (default)
  maxSubscriptionsPerSync: 100,
};
```

### Recommended Intervals
- **Development**: 5 minutes (300,000 ms)
- **Production**: 10 minutes (600,000 ms) - default
- **High Volume**: 15-30 minutes (900,000-1,800,000 ms)

## Testing the Sync

### 1. Check Sync Status
```bash
curl http://localhost:8080/api/sync-status
```

### 2. Trigger Manual Sync
```bash
curl -X POST http://localhost:8080/api/sync-status
```

### 3. Monitor Logs
Watch for sync operations in your server logs:
```bash
# Docker
docker logs -f <container-id>

# Direct process
# Check your process logs
```

### 4. Verify Database Updates
After a sync, check the `user_profiles` table to see updated premium fields.

## Error Handling

The sync service includes robust error handling:

### Service Errors
- If the sync service fails to start, the server logs a warning but continues running
- Missing environment variables disable the sync service with a clear warning

### Sync Errors
- Individual subscription sync failures don't stop the entire process
- Errors are logged but don't crash the server
- Failed syncs are retried on the next scheduled run

### Network Issues
- Temporary Stripe API failures are logged and retried next cycle
- Database connection issues are caught and logged

## Migration from auto-stripe-guardian.js

If you were previously using `auto-stripe-guardian.js` as a separate process:

1. ✅ **No migration needed** - the new system is already integrated
2. 🛑 **Stop the separate process** - it's no longer needed
3. ✅ **Restart the main server** - subscription sync starts automatically
4. ✅ **Monitor the logs** - verify sync operations are running

## Benefits

### Before (Manual or Separate Script)
- ❌ Required running a separate Node.js process
- ❌ More complex deployment
- ❌ Separate monitoring needed
- ❌ Potential sync conflicts

### After (Integrated)
- ✅ Single process handles everything
- ✅ Automatic startup/shutdown
- ✅ Built-in monitoring via `/api/sync-status`
- ✅ Simpler deployment
- ✅ Less resource usage

## Monitoring in Production

### Health Checks
The subscription sync status is included in the ready check:
```bash
curl http://your-domain.com/api/ready
```

### Alerting
Monitor these conditions:
1. `subscriptionSync.isRunning` should be `true`
2. `subscriptionSync.lastSyncTime` should be within the last 15 minutes
3. Watch logs for repeated sync failures

### Troubleshooting

**Issue**: Sync not running
```bash
# Check environment variables
curl http://your-domain.com/api/ready

# Look for:
"checks": {
  "env": {
    "STRIPE_SECRET_KEY": true,
    "SUPABASE_URL": true
  }
}
```

**Issue**: Sync running but no updates
- Check Stripe webhook secret is configured correctly
- Verify database permissions
- Trigger a manual sync and watch logs

**Issue**: High sync duration
- Consider increasing sync interval
- Check database performance
- Verify Stripe API response times

## Future Enhancements

Potential improvements for the future:
- [ ] Configurable sync intervals via environment variables
- [ ] Sync metrics and statistics endpoint
- [ ] Email notifications for sync failures
- [ ] Retry logic with exponential backoff
- [ ] Batch processing for large subscription counts
- [ ] Webhook event verification and replay

## Summary

The Stripe Guardian server now handles subscription syncing automatically with:
- ✅ **10-minute automatic sync** of all subscription statuses
- ✅ **Immediate startup** sync when server starts
- ✅ **API endpoints** for status and manual triggers
- ✅ **Detailed logging** for monitoring
- ✅ **Graceful error handling**
- ✅ **Zero additional processes** required

Your subscriptions will now stay in sync automatically! 🎉

