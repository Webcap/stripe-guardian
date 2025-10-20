/**
 * Create Discounted Price Endpoint
 * 
 * Creates a new Stripe price with a discount applied.
 * This is an alternative to coupons for special promotional pricing.
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
      productId,
      plan,
      discountValue,
      discountType = 'percentage'
    } = req.body;

    // Validate required fields
    if (!productId || !plan || !discountValue) {
      return res.status(400).json({
        error: 'Missing required fields: productId, plan, discountValue'
      });
    }

    // Validate plan structure
    if (!plan.id || !plan.price || !plan.interval) {
      return res.status(400).json({
        error: 'Plan must include: id, price, interval'
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

    // Validate fixed amount doesn't exceed plan price
    if (discountType === 'fixed_amount' && discountValue >= plan.price) {
      return res.status(400).json({
        error: 'fixed_amount discount cannot exceed or equal plan price'
      });
    }

    console.log(`Creating discounted price for product: ${productId}`);

    const priceId = await stripeService.createDiscountedPrice(
      productId,
      plan,
      discountValue,
      discountType
    );

    // Calculate final price for response
    let finalPrice;
    if (discountType === 'percentage') {
      finalPrice = plan.price * (1 - discountValue / 100);
    } else {
      finalPrice = plan.price - discountValue;
    }

    res.status(200).json({
      success: true,
      priceId,
      originalPrice: plan.price,
      discountedPrice: parseFloat(finalPrice.toFixed(2)),
      discountValue,
      discountType
    });
  } catch (error) {
    console.error('Error creating discounted price:', error);
    res.status(500).json({
      error: 'Failed to create discounted price',
      details: error.message
    });
  }
};

