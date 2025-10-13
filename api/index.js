// Stripe Guardian API - Root endpoint
module.exports = async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    name: 'Stripe Guardian API',
    version: '1.0.0',
    status: 'operational',
    endpoints: {
      health: '/api/health',
      ready: '/api/ready',
      stripe: {
        webhook: '/api/stripe/webhook',
        createCheckout: '/api/stripe/create-checkout',
        verifySession: '/api/stripe/verify-session',
        createCustomer: '/api/stripe/create-customer',
        createPaymentsheet: '/api/stripe/create-paymentsheet',
        confirmPaymentsheet: '/api/stripe/confirm-paymentsheet',
        syncPlan: '/api/stripe/sync-plan',
        cancelSubscription: '/api/stripe/cancel-subscription',
        reactivateSubscription: '/api/stripe/reactivate-subscription'
      }
    },
    timestamp: new Date().toISOString()
  }));
};

