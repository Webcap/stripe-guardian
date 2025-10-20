/**
 * Create Stripe Coupon Endpoint
 * 
 * Creates a Stripe coupon for a promotion. Can be used
 * for percentage or fixed-amount discounts.
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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      promotionId,
      name,
      discountType,
      discountValue,
      duration = 'once',
      durationInMonths,
      endDate,
      maxRedemptions,
      currency = 'usd'
    } = req.body;

    // Validate required fields
    if (!name || !discountType || !discountValue) {
      return res.status(400).json({
        error: 'Missing required fields: name, discountType, discountValue'
      });
    }

    // Validate discount type
    if (!['percentage', 'fixed_amount'].includes(discountType)) {
      return res.status(400).json({
        error: 'discountType must be "percentage" or "fixed_amount"'
      });
    }

    // Validate percentage value
    if (discountType === 'percentage' && (discountValue < 1 || discountValue > 100)) {
      return res.status(400).json({
        error: 'percentage discount must be between 1 and 100'
      });
    }

    // Validate duration
    if (!['once', 'repeating', 'forever'].includes(duration)) {
      return res.status(400).json({
        error: 'duration must be "once", "repeating", or "forever"'
      });
    }

    console.log(`Creating coupon for promotion: ${name}`);

    const promotionData = {
      id: promotionId,
      name,
      discountType,
      discountValue,
      duration,
      durationInMonths,
      endDate,
      maxRedemptions,
      currency
    };

    const result = await stripeService.createPromotionCoupon(promotionData);

    res.status(200).json({
      success: true,
      couponId: result.couponId,
      coupon: {
        id: result.coupon.id,
        name: result.coupon.name,
        percentOff: result.coupon.percent_off,
        amountOff: result.coupon.amount_off,
        currency: result.coupon.currency,
        duration: result.coupon.duration,
        durationInMonths: result.coupon.duration_in_months,
        redeemBy: result.coupon.redeem_by,
        maxRedemptions: result.coupon.max_redemptions,
        timesRedeemed: result.coupon.times_redeemed,
        valid: result.coupon.valid
      }
    });
  } catch (error) {
    console.error('Error creating coupon:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      type: error.type,
      code: error.code,
      statusCode: error.statusCode,
      raw: error.raw
    });
    res.status(500).json({
      error: 'Failed to create coupon',
      details: error.message,
      type: error.type || 'unknown',
      code: error.code || 'unknown'
    });
  }
};

