# Fixed 503 Service Unavailable Error

## Problem

The server was crashing due to a **module format mismatch**:
- `server.js` uses CommonJS (`require()`)
- API files were using ES6 modules (`export default`)
- Node.js couldn't load the modules, causing crashes → 503 errors

## Files Fixed

### ✅ Converted to CommonJS:
1. `api/index.js` - Created (was missing)
2. `api/health.js` - Converted from ES6 to CommonJS
3. `api/ready.js` - Converted from ES6 to CommonJS  
4. `api/webhook.js` - Converted from ES6 to CommonJS

### ✅ Already correct:
- `api/test.js` - Already CommonJS
- `api/[...catchall].js` - Already CommonJS
- All `api/stripe/*.js` files - Already CommonJS

## Changes Made

### Before (Broken):
```javascript
export default async function handler(req, res) {
  return res.status(200).json({ ok: true });
}
```

### After (Fixed):
```javascript
module.exports = async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
};
```

## Deploy Instructions

### 1. Commit Changes
```bash
cd c:\Users\cnieves\Desktop\Projects\stripe-guardian
git add -A
git commit -m "Fix 503 error: Convert API files to CommonJS format"
git push
```

### 2. Redeploy in Spaceship Hyperlift
- Go to your Spaceship dashboard
- Click "Redeploy" or it will auto-deploy from git
- Wait for build to complete (~2-3 minutes)

### 3. Test Endpoints
```bash
# Health check
curl https://api.webcap.media/api/health

# Root endpoint
curl https://api.webcap.media/api

# Cancel subscription
curl -X POST https://api.webcap.media/api/stripe/cancel-subscription
```

## Expected Results

### Root endpoint (`/api`):
```json
{
  "name": "Stripe Guardian API",
  "version": "1.0.0",
  "status": "operational",
  "endpoints": { ... }
}
```

### Health check (`/api/health`):
```json
{
  "ok": true,
  "timestamp": "2025-10-13T...",
  "service": "Stripe Guardian",
  "status": "healthy"
}
```

### Ready check (`/api/ready`):
```json
{
  "ok": true,
  "timestamp": "2025-10-13T...",
  "service": "Stripe Guardian",
  "checks": {
    "env": { ... },
    "stripe": true,
    "supabase": true
  }
}
```

## Why This Happened

The Dockerfile was optimized to only install production dependencies, which is correct. However, the API files were written for Vercel (which supports ES6 modules natively), but we're deploying to Docker which runs plain Node.js that requires CommonJS format.

## Status

✅ **All files fixed and ready to deploy!**

---

**Date**: October 13, 2025  
**Issue**: 503 Service Unavailable  
**Cause**: ES6/CommonJS module format mismatch  
**Solution**: Converted all API files to CommonJS format

