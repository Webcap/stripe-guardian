# Stripe Guardian - Promotion System Deployment Checklist

## ✅ Local Environment (stripe-guardian workspace)

### Files Modified/Created:

#### Modified Files:
- [x] `server.js` - Added 4 promotion routes + enhanced CORS
- [x] `server/services/StripeService.server.js` - Added 7 promotion methods
- [x] `api/stripe/create-checkout.js` - Added couponId & promotionId support
- [x] `api/stripe/create-paymentsheet.js` - Added couponId & promotionId to metadata
- [x] `api/stripe/confirm-paymentsheet.js` - Apply coupon to subscription

#### New Files:
- [x] `api/stripe/create-coupon.js` - Create Stripe coupons
- [x] `api/stripe/create-promotion-code.js` - Create promo codes
- [x] `api/stripe/create-discounted-price.js` - Create discounted prices
- [x] `api/stripe/validate-coupon.js` - Validate coupons
- [x] `PROMOTION_CORS_FIX.md` - Documentation
- [x] `DEPLOYMENT_CHECKLIST_PROMOTIONS.md` - This file

### Verify Local Files:

Run this to verify all files exist:
```bash
cd stripe-guardian

# Check new endpoints exist
ls api/stripe/create-coupon.js
ls api/stripe/create-promotion-code.js
ls api/stripe/create-discounted-price.js
ls api/stripe/validate-coupon.js

# Check modified files
git status
```

Expected output:
```
modified:   server.js
modified:   server/services/StripeService.server.js
modified:   api/stripe/create-checkout.js
modified:   api/stripe/create-paymentsheet.js
modified:   api/stripe/confirm-paymentsheet.js
Untracked files:
  api/stripe/create-coupon.js
  api/stripe/create-promotion-code.js
  api/stripe/create-discounted-price.js
  api/stripe/validate-coupon.js
```

---

## 🚀 Render Environment (Deployed)

### Step 1: Check Current Deployment

Before deploying, verify your current Render setup:

1. **Environment Variables** (in Render Dashboard):
   - ✅ `STRIPE_SECRET_KEY` - Your Stripe secret key
   - ✅ `STRIPE_WEBHOOK_SECRET` - Your webhook signing secret
   - ✅ `WIZNOTE_SUPABASE_URL` - Your Supabase project URL
   - ✅ `WIZNOTE_SUPABASE_SECRET_KEY` or `WIZNOTE_SUPABASE_SERVICE_KEY` - Service role key

2. **Service Settings**:
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Port: Auto-assigned (uses `process.env.PORT`)

### Step 2: Deploy Changes

**Option A: Git Auto-Deploy (Recommended)**
```bash
cd stripe-guardian
git add .
git commit -m "feat: Add promotion system with CORS fixes

- Add 4 new promotion endpoints (coupons, promo codes, discounted prices)
- Extend StripeService with 7 promotion methods
- Update checkout endpoints to accept couponId and promotionId
- Fix CORS to allow localhost:8081 for development
- Add get-billing-history route to server mapping"

git push origin main
```

**Option B: Manual Deploy**
1. Go to https://dashboard.render.com
2. Select your Stripe Guardian service
3. Click **"Manual Deploy"**
4. Choose **"Deploy latest commit"**
5. Wait 3-5 minutes

**Option C: Render CLI**
```bash
render deploy --service stripe-guardian
```

### Step 3: Verify Deployment

Once deployed, run these tests:

**Test 1: Health Check**
```bash
curl https://stripe-guardian.onrender.com/api/health
```
Expected: `{"status":"ok","timestamp":"..."}`

**Test 2: Ready Check**
```bash
curl https://stripe-guardian.onrender.com/api/ready
```
Expected: `{"ok":true,"checks":{...}}`

**Test 3: CORS Check**
```javascript
// In browser console on localhost:8081
fetch('https://stripe-guardian.onrender.com/api/ready')
  .then(r => r.json())
  .then(console.log);
```
Expected: No CORS errors, returns ready status

**Test 4: Promotion Endpoint**
```bash
curl -X POST https://stripe-guardian.onrender.com/api/stripe/validate-coupon \
  -H "Content-Type: application/json" \
  -d '{"code":"TEST123"}'
```
Expected: `{"valid":false,"error":"Invalid promotion code"}` (normal for fake code)

---

## 🔍 Troubleshooting

### Issue: CORS Still Blocked After Deploy

**Check:**
1. Deployment completed successfully?
2. Browser cache cleared? (Hard refresh: Ctrl+Shift+R)
3. Using correct URL? (not localhost:8080)

**Fix:**
```bash
# Force redeploy
render deploy --service stripe-guardian --clear-cache
```

### Issue: 404 on New Endpoints

**Check:**
```bash
# View Render logs
render logs --service stripe-guardian --tail
```

Look for:
```
🚀 Stripe Guardian API Server running on port 8080
```

If routes not registered, the server didn't restart properly.

**Fix:**
Restart the service in Render dashboard.

### Issue: Server Not Starting

**Check Render logs for:**
- Missing environment variables
- Syntax errors in server.js
- Module not found errors

**Fix:**
- Verify all env vars in Render dashboard
- Check build logs for errors
- Ensure package.json has all dependencies

---

## 📊 Deployment Summary

### Local Changes (stripe-guardian workspace):
✅ **9 files modified**
✅ **4 new files created**
✅ **CORS headers enhanced**
✅ **All endpoints registered**

### To Deploy:
1. Commit changes
2. Push to git
3. Wait for Render auto-deploy (3-5 min)
4. Verify with curl/fetch tests
5. Refresh browser and test promotions

### After Deployment:
✅ CORS errors gone  
✅ All promotion endpoints accessible  
✅ Can create Stripe coupons  
✅ Can process payments with discounts  
✅ Full promotion system operational  

---

## ⏭️ Next Steps

1. **Deploy to Render** (commit & push)
2. **Wait 3-5 minutes** for deployment
3. **Hard refresh browser** (Ctrl+Shift+R)
4. **Test promotion flow end-to-end**
5. **Create real promotions!** 🎉

All your local changes are ready to go - just need to deploy them!

