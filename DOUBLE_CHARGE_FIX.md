# Double Charge Fix - Mobile Subscription Payments

## Problem Summary
Mobile users were being charged **TWICE** when subscribing:
1. **First charge**: PaymentIntent ($9.99 one-time)
2. **Second charge**: Subscription creation ($9.99/month)

This also caused the subscription to show as "incomplete" in Stripe.

## Root Cause
The payment flow was using **PaymentIntent** (which charges immediately) instead of **SetupIntent** (which only collects the payment method). When the subscription was created afterward, it charged the user again.

### Old (Broken) Flow
```
1. create-paymentsheet.js creates PaymentIntent
   → Charges $9.99 immediately
2. User completes payment in PaymentSheet
3. confirm-paymentsheet.js creates subscription
   → Charges $9.99 again
   → Total: $19.98 charged! ❌
```

### New (Fixed) Flow
```
1. create-paymentsheet.js creates SetupIntent
   → Only saves payment method, NO charge
2. User completes setup in PaymentSheet
3. confirm-paymentsheet.js creates subscription with saved payment method
   → Charges $9.99 once
   → Total: $9.99 charged ✅
```

## Files Changed

### 1. `api/stripe/create-paymentsheet.js`
**Changed**: PaymentIntent → SetupIntent
```javascript
// OLD - Double charged
const paymentIntent = await stripe.paymentIntents.create({
  amount: planPrice,
  currency: planCurrency,
  customer: customerId,
  // ... charges user immediately
});

// NEW - Only collects payment method
const setupIntent = await stripe.setupIntents.create({
  customer: customerId,
  // ... saves payment method, no charge
});
```

**Response Changes**:
- Now returns `setupIntent` and `setupIntentId` (instead of `paymentIntent` and `paymentIntentId`)
- Includes `planId` and `stripePriceId` for subscription creation

### 2. `api/stripe/confirm-paymentsheet.js`
**Changed**: Now handles both SetupIntent (new) and PaymentIntent (old for compatibility)

```javascript
// Supports both flows
if (setupIntentId) {
  // New flow: Get payment method from SetupIntent
  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
  paymentMethod = setupIntent.payment_method;
} else {
  // Old flow: Get payment method from PaymentIntent (backward compatible)
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  paymentMethod = paymentIntent.payment_method;
}

// Create subscription (this is the ONLY charge)
const subscription = await stripe.subscriptions.create({
  customer: customerId,
  items: [{ price: priceId }],
  default_payment_method: paymentMethod,
  // ...
});
```

### 3. `components/PaymentSheetForm.native.tsx`
**Changed**: Updated to support both SetupIntent and PaymentIntent

- Added `intentType` state to track whether using setup or payment intent
- Updated PaymentSheet initialization to use `setupIntentClientSecret` or `paymentIntentClientSecret`
- Updated confirmation request to send `setupIntentId` or `paymentIntentId`
- Maintains backward compatibility with old flow

### 4. `api/stripe/webhook.js`
**Fixed**: All webhook handlers now use correct `premium` JSON object schema

- `checkout.session.completed` - NEW handler for immediate activation
- `customer.subscription.created` - Updates premium status
- `customer.subscription.updated` - Updates status changes
- `customer.subscription.deleted` - Handles cancellations
- `invoice.payment_succeeded` - Confirms payments
- `invoice.payment_failed` - Handles failures

## Testing Checklist

- [ ] Deploy stripe-guardian project to production
- [ ] Test mobile subscription purchase
- [ ] Verify only ONE charge in Stripe dashboard
- [ ] Verify subscription shows as "active" (not incomplete)
- [ ] Verify user premium status updates correctly
- [ ] Check webhook logs for `checkout.session.completed`
- [ ] Verify premium features unlock immediately

## Deployment Steps

```bash
cd C:\Users\cnieves\Desktop\Projects\stripe-guardian
vercel --prod
```

## Expected Behavior After Fix

### Mobile Subscription Purchase:
1. User taps "Subscribe" button
2. PaymentSheet shows card input
3. User enters card details
4. Card is validated and saved (SetupIntent)
5. Subscription is created with saved payment method
6. **Single charge of $9.99** appears in Stripe ✅
7. Subscription status = "active" ✅
8. User becomes premium immediately ✅

### Stripe Dashboard:
- 1 charge for $9.99 (from subscription creation)
- Subscription status: Active
- Payment method saved to customer
- Webhook events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `invoice.payment_succeeded`

## Backward Compatibility

The code still supports the old PaymentIntent flow for any in-flight payments, but all new payments will use SetupIntent to avoid double charging.

## Prevention

To prevent double charging in the future:
- ✅ Always use SetupIntent for subscriptions (not PaymentIntent)
- ✅ PaymentIntent should only be used for one-time purchases
- ✅ Let subscriptions handle their own billing automatically
- ✅ Test with Stripe test cards before going to production

## Verification

After deployment, verify in Stripe dashboard:
1. Go to Payments → All transactions
2. Look for test.5@webcap.cc (or any test account)
3. Should see only ONE charge per subscription
4. Subscription should show "Active" status
5. No "incomplete" subscriptions

---

**Status**: ✅ Fixed and ready to deploy
**Impact**: Prevents double charging for all mobile subscription purchases
**Priority**: CRITICAL - Deploy immediately

