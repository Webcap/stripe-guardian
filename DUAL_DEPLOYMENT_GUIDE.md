# 🚀 Dual Stripe Guardian Deployment Guide

This guide will help you set up **separate Development and Production** Stripe Guardian instances on Render.

## 📋 Why Two Instances?

- **Dev Instance**: Uses Stripe **TEST** keys for safe testing with fake credit cards
- **Prod Instance**: Uses Stripe **LIVE** keys for real customer payments

This keeps your testing completely isolated from production data!

---

## 🔧 Step 1: Commit and Push Changes

```bash
cd stripe-guardian

# Add the updated files
git add scripts/auto-stripe-guardian-render.js
git add render.yaml

# Commit with a clear message
git commit -m "Add dual dev/prod Stripe Guardian setup with sync-status endpoint"

# Push to GitHub
git push origin main
```

---

## 🌐 Step 2: Deploy to Render

### Option A: Using render.yaml (Recommended)

1. **Go to [Render Dashboard](https://dashboard.render.com)**
2. **Click "New +" → "Blueprint"**
3. **Connect your GitHub repository**
4. **Select the repository with `render.yaml`**
5. **Render will automatically create BOTH services:**
   - `stripe-guardian-dev` ✅
   - `stripe-guardian-prod` ✅

### Option B: Manual Setup

If you already have services, update them manually:

1. **Go to your existing `stripe-guardian` service**
2. **Update Start Command**: `node scripts/auto-stripe-guardian-render.js`
3. **Update Health Check Path**: `/health`
4. **Save and deploy**

Then create a new service for dev:

1. **Click "New +" → "Web Service"**
2. **Connect your GitHub repo**
3. **Name**: `stripe-guardian-dev`
4. **Start Command**: `node scripts/auto-stripe-guardian-render.js`
5. **Add environment variables** (see below)

---

## 🔑 Step 3: Configure Environment Variables

### For DEV Instance (`stripe-guardian-dev`)

| Key | Value | Description |
|-----|-------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `8080` | Server port |
| `STRIPE_SECRET_KEY` | `sk_test_...` | **TEST** Stripe key |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | **TEST** webhook secret |
| `WIZNOTE_SUPABASE_URL` | Your Supabase URL | Database URL |
| `WIZNOTE_SUPABASE_SECRET_KEY` | Your secret key | Database auth |

### For PROD Instance (`stripe-guardian-prod`)

| Key | Value | Description |
|-----|-------|-------------|
| `NODE_ENV` | `production` | Environment mode |
| `PORT` | `8080` | Server port |
| `STRIPE_SECRET_KEY` | `sk_live_...` | **LIVE** Stripe key ⚠️ |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | **LIVE** webhook secret |
| `WIZNOTE_SUPABASE_URL` | Your Supabase URL | Database URL |
| `WIZNOTE_SUPABASE_SECRET_KEY` | Your secret key | Database auth |

---

## 🧪 Step 4: Test Your Endpoints

### Dev Instance

```bash
# Test health
curl https://stripe-guardian-dev.onrender.com/health

# Test readiness
curl https://stripe-guardian-dev.onrender.com/ready

# Test sync status (NEW!)
curl https://stripe-guardian-dev.onrender.com/sync-status
```

Expected response from `/sync-status`:
```json
{
  "ok": true,
  "sync": {
    "enabled": true,
    "lastCheck": "2025-10-18T03:15:00.000Z",
    "consecutiveFailures": 0,
    "healthCheckInterval": "120s",
    "autoFixInterval": "300s",
    "uptime": 1234.567
  },
  "timestamp": "2025-10-18T03:15:30.123Z"
}
```

### Prod Instance

```bash
# Same endpoints, just different URL
curl https://stripe-guardian-prod.onrender.com/health
curl https://stripe-guardian-prod.onrender.com/ready
curl https://stripe-guardian-prod.onrender.com/sync-status
```

---

## 📱 Step 5: Update Your App

Your WizNote app is already configured to use the correct instances:

### Development Mode (localhost, Expo Go, etc.)
✅ Points to: `https://stripe-guardian-dev.onrender.com`
✅ Uses: Stripe TEST keys
✅ Safe for testing with fake credit cards

### Production Mode (deployed app)
✅ Points to: `https://api.webcap.media/api`
✅ Uses: Stripe LIVE keys
✅ Real customer payments

No code changes needed in your app! 🎉

---

## 🔄 Current Service URLs

After deployment, you'll have:

- **Dev**: `https://stripe-guardian-dev.onrender.com`
- **Prod**: `https://stripe-guardian-prod.onrender.com`

Your existing `stripe-guardian.onrender.com` can be:
- Renamed to `-dev` or `-prod`
- Or deleted if you're creating fresh services

---

## 📊 Available Endpoints (Both Instances)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service info |
| `/health` | GET | Health check with detailed status |
| `/ready` | GET | Readiness check |
| `/sync-status` | GET | Subscription sync status (NEW!) |

---

## 🚨 Important Notes

### ⚠️ Stripe Keys
- **NEVER** mix TEST and LIVE keys
- **NEVER** commit keys to Git
- **ALWAYS** use environment variables

### 🔒 Security
- Dev instance = TEST keys = Safe to experiment
- Prod instance = LIVE keys = Real money! Be careful!

### 💰 Render Free Tier
- **750 hours/month per service** (enough for 24/7 operation)
- You can run 2 services on free tier simultaneously
- Services spin down after 15 minutes of inactivity
- First request after spindown takes ~30 seconds

---

## 🧪 Testing Your Setup

### Test Dev Instance (Safe!)

```bash
# In your WizNote app, set to development mode
npm run web

# Try test payment flow
# Use Stripe test card: 4242 4242 4242 4242
```

### Test Prod Instance (Real Money!)

```bash
# Deploy your app to production
# Use real credit cards
# Monitor stripe-guardian-prod.onrender.com/health
```

---

## 🐛 Troubleshooting

### Dev Instance Not Working?

1. **Check environment variables** - Make sure TEST keys are set
2. **Check logs** - View logs in Render dashboard
3. **Check health endpoint** - `curl https://stripe-guardian-dev.onrender.com/health`
4. **Wake it up** - Free tier services sleep, first request wakes them

### CORS Errors?

The endpoints already have CORS enabled:
```javascript
res.setHeader('Access-Control-Allow-Origin', '*');
```

If you still get CORS errors:
1. Service might be spinning up (wait 30 seconds)
2. Check the service is deployed and running
3. Verify the URL is correct

### 404 Errors?

- Check you're using the correct URL
- Dev instance has NO `/api` prefix
- Starlight Hyperlift (prod) HAS `/api` prefix

---

## 🎯 Next Steps

1. ✅ Push code to GitHub
2. ✅ Deploy both instances on Render
3. ✅ Configure environment variables
4. ✅ Test all endpoints
5. ✅ Test payment flow in your app
6. ✅ Monitor both instances

---

## 📞 Support

- **Render Issues**: [docs.render.com](https://docs.render.com)
- **Stripe Issues**: [stripe.com/docs](https://stripe.com/docs)
- **Guardian Issues**: Check logs and health endpoints

---

**Your dual Stripe Guardian setup is ready! 🎉**

Test payments stay in dev, real payments go to prod. Perfect separation! 🚀

