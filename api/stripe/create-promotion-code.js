/**
 * Create Stripe Promotion Code Endpoint
 * 
 * Creates a user-friendly promotion code string (e.g., "SUMMER30")
 * that customers can enter at checkout. Must be linked to an existing coupon.
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
      couponId,
      code,
      active = true,
      maxRedemptions,
      expiresAt,
      metadata = {}
    } = req.body;

    // Validate required fields
    if (!couponId || !code) {
      return res.status(400).json({
        error: 'Missing required fields: couponId, code'
      });
    }

    // Validate code format (alphanumeric, uppercase)
    const codePattern = /^[A-Z0-9_-]+$/;
    if (!codePattern.test(code.toUpperCase())) {
      return res.status(400).json({
        error: 'Code must contain only letters, numbers, underscores, and hyphens'
      });
    }

    console.log(`Creating promotion code: ${code} for coupon: ${couponId}`);

    const options = {
      active,
      maxRedemptions,
      expiresAt,
      metadata
    };

    const result = await stripeService.createPromotionCode(couponId, code, options);

    res.status(200).json({
      success: true,
      promotionCodeId: result.promotionCodeId,
      promotionCode: {
        id: result.promotionCode.id,
        code: result.promotionCode.code,
        couponId: result.promotionCode.coupon,
        active: result.promotionCode.active,
        maxRedemptions: result.promotionCode.max_redemptions,
        timesRedeemed: result.promotionCode.times_redeemed,
        expiresAt: result.promotionCode.expires_at
      }
    });
  } catch (error) {
    console.error('Error creating promotion code:', error);
    
    // Handle duplicate code error
    if (error.code === 'resource_already_exists') {
      return res.status(409).json({
        error: 'Promotion code already exists',
        details: 'This code is already in use. Please choose a different code.'
      });
    }

    res.status(500).json({
      error: 'Failed to create promotion code',
      details: error.message
    });
  }
};

