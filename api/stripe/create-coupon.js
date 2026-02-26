/**
 * Create Stripe Coupon Endpoint
 * 
 * Creates a Stripe coupon for a promotion. Can be used
 * for percentage or fixed-amount discounts.
 */

const { stripeService } = require('../../server/services/StripeService.server');
const { getCorsHeaders } = require('../../server/lib/cors');

module.exports = async (req, res) => {
  const corsHeaders = getCorsHeaders(req);
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
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
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Missing required fields: name, discountType, discountValue'
      }));
      return;
    }

    // Validate discount type
    if (!['percentage', 'fixed_amount'].includes(discountType)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'discountType must be "percentage" or "fixed_amount"'
      }));
      return;
    }

    // Validate percentage value
    if (discountType === 'percentage' && (discountValue < 1 || discountValue > 100)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'percentage discount must be between 1 and 100'
      }));
      return;
    }

    // Validate duration
    if (!['once', 'repeating', 'forever'].includes(duration)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'duration must be "once", "repeating", or "forever"'
      }));
      return;
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

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
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
    }));
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
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Failed to create coupon',
      details: error.message,
      type: error.type || 'unknown',
      code: error.code || 'unknown'
    }));
  }
};

