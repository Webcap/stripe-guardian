# 🚀 Deploy Stripe Guardian to Vercel

This guide will help you deploy your Stripe Guardian webhook server to Vercel for production use.

## 📋 Prerequisites

- GitHub repository with your Stripe Guardian code
- Vercel account (free at [vercel.com](https://vercel.com))
- Stripe account with API keys
- Supabase project with service role key

## 🎯 Quick Deploy (5 minutes)

### 1. Push to GitHub
```bash
git add .
git commit -m "Ready for Vercel deployment"
git push origin main
```

### 2. Deploy to Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy (first time)
vercel

# Follow the prompts:
# - Link to existing project? No
# - Project name: stripe-guardian
# - Directory: ./
# - Override settings? No
```

### 3. Set Environment Variables
In your Vercel dashboard:
1. Go to your project settings
2. Navigate to "Environment Variables"
3. Add these variables:

```bash
STRIPE_SECRET_KEY=sk_live_... (or sk_test_...)
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 4. Redeploy with Environment Variables
```bash
vercel --prod
```

## 🔧 Configuration

### Vercel Configuration
The `vercel.json` file is already configured for you:
- Routes all requests to your webhook server
- Sets appropriate function timeout (30 seconds)
- Optimized for serverless deployment

### Stripe Webhook URL
After deployment, update your Stripe webhook endpoint to:
```
https://your-app-name.vercel.app/webhook
```

**Note**: The webhook is now deployed as `/api/webhook` but accessible at `/webhook` for convenience.

## 🧪 Testing Your Deployment

### 1. Health Check
```bash
curl https://your-app-name.vercel.app/health
# Should return: {"ok": true}
```

### 2. Ready Check
```bash
curl https://your-app-name.vercel.app/ready
# Should return readiness status
```

### 3. Direct API Access
```bash
curl https://your-app-name.vercel.app/api/webhook
# Access the webhook directly
```

### 3. Test Webhook
Use Stripe CLI to test:
```bash
stripe listen --forward-to https://your-app-name.vercel.app/webhook
```

## 🔄 Local Guardian + Vercel Webhook

You can run the guardian locally while using the Vercel-hosted webhook:

```bash
# Start local guardian (connects to Vercel webhook)
npm run stripe:guardian

# Guardian will monitor the Vercel webhook endpoint
```

## 📊 Monitoring

### Vercel Analytics
- View function execution times
- Monitor error rates
- Track webhook performance

### Logs
- Function logs in Vercel dashboard
- Real-time deployment logs
- Error tracking and debugging

## 🚨 Troubleshooting

### Common Issues

#### Environment Variables Not Set
```bash
# Check in Vercel dashboard
# Redeploy after setting variables
vercel --prod
```

#### Function Timeout
- Default timeout is 30 seconds
- Increase in `vercel.json` if needed
- Optimize your webhook processing

#### CORS Issues
- CORS is enabled for development
- Vercel handles CORS automatically
- No additional configuration needed

### Debug Commands
```bash
# View deployment status
vercel ls

# View function logs
vercel logs

# Redeploy
vercel --prod
```

## 🔒 Security

- Environment variables are encrypted in Vercel
- HTTPS is automatically enabled
- Webhook signature verification is maintained
- No sensitive data in your code

## 💰 Costs

- **Free Tier**: 100GB-hours/month
- **Pro Plan**: $20/month for more resources
- **Enterprise**: Custom pricing

For most webhook usage, the free tier is sufficient.

## 🎉 Success!

Your Stripe Guardian is now running on Vercel with:
- ✅ Automatic HTTPS
- ✅ Global CDN
- ✅ Auto-scaling
- ✅ Zero maintenance
- ✅ Real-time monitoring

## 📞 Support

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Community](https://github.com/vercel/vercel/discussions)
- [Stripe Webhook Guide](https://stripe.com/docs/webhooks)
