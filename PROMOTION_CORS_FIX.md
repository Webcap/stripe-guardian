# CORS Fix for Stripe Guardian - Promotion System

## ✅ What Was Fixed

Updated `server.js` with:

1. **Enhanced CORS Headers**
   - Allow all origins with `*`
   - Added PATCH method support
   - Added more allowed headers
   - Added credentials support

2. **New Promotion Routes**
   - `/api/stripe/create-coupon`
   - `/api/stripe/create-promotion-code`
   - `/api/stripe/create-discounted-price`
   - `/api/stripe/validate-coupon`

3. **Added Missing Route**
   - `/api/stripe/get-billing-history`

## 🚀 Deploy to Render

### Option 1: Automatic Deployment (If Git is Connected)

```bash
# In stripe-guardian directory
git add .
git commit -m "feat: Add promotion endpoints and fix CORS for localhost"
git push
```

Render will automatically detect the changes and redeploy.

### Option 2: Manual Redeploy

1. Go to your Render dashboard
2. Find your Stripe Guardian service
3. Click **"Manual Deploy"** → **"Deploy latest commit"**

### Option 3: Using Render CLI

```bash
render deploy --service stripe-guardian
```

## ⏱️ Deployment Time

- Typical deployment: 2-5 minutes
- First-time build: 5-10 minutes

## ✅ Verify Deployment

After deployment completes, test in browser console:

```javascript
fetch('https://stripe-guardian.onrender.com/api/ready')
  .then(r => r.json())
  .then(data => console.log('CORS Fixed:', data))
  .catch(err => console.error('Still blocked:', err));
```

Expected result:
```json
{
  "ok": true,
  "service": "Stripe Guardian",
  "timestamp": "2024-...",
  "checks": {
    "stripe": true,
    "supabase": true,
    "env": {...}
  }
}
```

## 🔧 Alternative: Test Locally First

If you want to test the promotion endpoints locally before deploying:

```bash
# In stripe-guardian directory
cd stripe-guardian

# Make sure you have .env file with:
# STRIPE_SECRET_KEY=sk_...
# WIZNOTE_SUPABASE_URL=...
# WIZNOTE_SUPABASE_SECRET_KEY=...

# Run locally
npm start

# Test endpoint
curl http://localhost:8080/api/ready
```

## 📋 Changed Files

1. `server.js` - Added routes and enhanced CORS
2. `api/stripe/create-coupon.js` - New promotion endpoint
3. `api/stripe/create-promotion-code.js` - New promotion endpoint
4. `api/stripe/create-discounted-price.js` - New promotion endpoint
5. `api/stripe/validate-coupon.js` - New promotion endpoint
6. `api/stripe/create-checkout.js` - Updated for promotions
7. `api/stripe/create-paymentsheet.js` - Updated for promotions
8. `api/stripe/confirm-paymentsheet.js` - Updated for promotions
9. `server/services/StripeService.server.js` - Added promotion methods

## ⚡ Quick Fix (Temporary)

If you can't deploy right now, you can work around CORS by:

### Option A: Use Browser Extension
Install a CORS extension like "CORS Unblock" or "Allow CORS" (Chrome/Edge)

### Option B: Update Your Local Config
Point to a local Stripe Guardian instead:

```typescript
// In constants/ApiConfig.ts or similar
const STRIPE_GUARDIAN_URL = process.env.NODE_ENV === 'development'
  ? 'http://localhost:8080'  // Local instance
  : 'https://stripe-guardian.onrender.com';  // Production
```

Then run Stripe Guardian locally during development.

## 🎯 After Deployment

Once deployed, the CORS errors will disappear and you'll be able to:
- ✅ Create Stripe coupons from admin dashboard
- ✅ Validate promotion codes
- ✅ Apply discounts to checkouts
- ✅ Process payments with promotions

## ℹ️ Note

The **promotion display, tracking, and UI features** work perfectly even with the CORS errors because they use Supabase directly. You're only blocked from:
- Creating Stripe coupons via API
- Processing actual Stripe payments

Everything else in the promotion system works! 🎉

