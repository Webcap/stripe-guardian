/**
 * Validate Coupon/Promotion Code Endpoint
 * 
 * Validates a coupon ID or promotion code string to check if it's
 * valid, active, and not expired or maxed out on redemptions.
 */

const { stripeService } = require('../../server/services/StripeService.server');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Accept both GET and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get code from query param (GET) or body (POST)
    const code = req.method === 'GET' 
      ? req.query.code 
      : req.body.code;

    if (!code) {
      return res.status(400).json({
        error: 'Missing required parameter: code'
      });
    }

    console.log(`Validating coupon/promo code: ${code}`);

    const validation = await stripeService.validateCoupon(code);

    if (!validation.valid) {
      return res.status(200).json({
        valid: false,
        error: validation.error
      });
    }

    // Return validation result with coupon details
    res.status(200).json({
      valid: true,
      coupon: {
        id: validation.coupon.id,
        name: validation.coupon.name,
        percentOff: validation.coupon.percent_off,
        amountOff: validation.coupon.amount_off,
        currency: validation.coupon.currency,
        duration: validation.coupon.duration,
        durationInMonths: validation.coupon.duration_in_months,
        redeemBy: validation.coupon.redeem_by,
        maxRedemptions: validation.coupon.max_redemptions,
        timesRedeemed: validation.coupon.times_redeemed
      },
      discountType: validation.discountType,
      discountValue: validation.discountValue,
      promotionCode: validation.promoCode ? {
        id: validation.promoCode.id,
        code: validation.promoCode.code,
        active: validation.promoCode.active,
        expiresAt: validation.promoCode.expires_at
      } : null
    });
  } catch (error) {
    console.error('Error validating coupon:', error);
    res.status(500).json({
      error: 'Failed to validate coupon',
      details: error.message
    });
  }
};

