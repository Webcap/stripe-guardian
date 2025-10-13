# Deploying Stripe Guardian to Spaceship Hyperlift

## Prerequisites

- Spaceship Hyperlift account
- Docker installed locally (for testing)
- Stripe API keys
- Supabase credentials

## Quick Deployment Steps

### 1. Prepare Your Repository

The repository is ready with:
- ✅ `Dockerfile` - Optimized for cloud deployment
- ✅ `.dockerignore` - Excludes unnecessary files
- ✅ `server.js` - Main server entry point
- ✅ `api/` - All API endpoints including new cancellation features

### 2. Set Environment Variables in Spaceship Hyperlift

Configure these environment variables in your Spaceship Hyperlift dashboard:

```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
SUPABASE_URL=your_supabase_url_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
PORT=3001
```

### 3. Deploy to Spaceship Hyperlift

#### Option A: Via Git Integration

1. Connect your repository to Spaceship Hyperlift
2. Select the `stripe-guardian` repository
3. Spaceship will automatically detect the Dockerfile
4. Configure environment variables
5. Deploy!

#### Option B: Via CLI (if available)

```bash
cd c:\Users\cnieves\Desktop\Projects\stripe-guardian

# Login to Spaceship Hyperlift
spaceship login

# Deploy
spaceship deploy
```

#### Option C: Manual Docker Build & Push

```bash
cd c:\Users\cnieves\Desktop\Projects\stripe-guardian

# Build the image
docker build -t stripe-guardian:latest .

# Tag for Spaceship Hyperlift registry
docker tag stripe-guardian:latest registry.spaceship.com/your-org/stripe-guardian:latest

# Push to registry
docker push registry.spaceship.com/your-org/stripe-guardian:latest
```

### 4. Test the Deployment

Once deployed, test these endpoints:

#### Health Check
```bash
curl https://your-app.spaceship.io/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-13T..."
}
```

#### Cancel Subscription Test
```bash
curl -X POST https://your-app.spaceship.io/api/stripe/cancel-subscription \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-uuid",
    "subscriptionId": "sub_xxxxx"
  }'
```

### 5. Update Your Wiznote App

Update the webhook URL in your wiznote `.env`:

```env
EXPO_PUBLIC_WEBHOOK_BASE_URL=https://your-app.spaceship.io/api
```

## Docker Configuration Details

### Port Configuration

- **Container Port**: 3001 (default, can be overridden with `PORT` env var)
- **Exposed Port**: Configured in Spaceship Hyperlift dashboard

### Health Checks

The Dockerfile includes a health check that runs every 30 seconds:
```
curl -f http://localhost:3001/api/health || exit 1
```

This ensures your service is automatically restarted if it becomes unhealthy.

### Resource Requirements

**Minimum Recommended**:
- CPU: 0.25 vCPU
- Memory: 512 MB
- Disk: 1 GB

**Production Recommended**:
- CPU: 0.5 vCPU
- Memory: 1 GB
- Disk: 2 GB

## Available Endpoints

Once deployed, these endpoints will be available:

### Public Endpoints
- `GET /` - Service info
- `GET /api` - API info
- `GET /api/health` - Health check
- `GET /api/ready` - Readiness check

### Stripe Endpoints
- `POST /api/stripe/webhook` - Stripe webhook handler
- `POST /api/stripe/create-checkout` - Create checkout session
- `POST /api/stripe/verify-session` - Verify payment session
- `POST /api/stripe/create-customer` - Create Stripe customer
- `POST /api/stripe/create-paymentsheet` - Create payment sheet (mobile)
- `POST /api/stripe/confirm-paymentsheet` - Confirm payment sheet
- `POST /api/stripe/sync-plan` - Sync plans to Stripe
- `POST /api/stripe/cancel-subscription` - Cancel subscription ⭐ NEW
- `POST /api/stripe/reactivate-subscription` - Reactivate subscription ⭐ NEW

## Troubleshooting

### Container Won't Start

Check logs in Spaceship Hyperlift dashboard:
```bash
spaceship logs stripe-guardian
```

Common issues:
- Missing environment variables
- Port conflicts
- Insufficient resources

### Health Check Failing

1. Verify the service is listening on the correct port
2. Check environment variable `PORT` is set correctly
3. Ensure `/api/health` endpoint is accessible

### API Errors

1. Check Stripe API keys are correct
2. Verify Supabase credentials
3. Check CORS settings if requests from browser fail

## Monitoring

### Logs

View real-time logs:
```bash
spaceship logs -f stripe-guardian
```

### Metrics

Monitor these metrics in Spaceship Hyperlift dashboard:
- Request rate
- Response time
- Error rate
- CPU usage
- Memory usage

### Alerts

Set up alerts for:
- Health check failures
- High error rates
- Resource limits reached

## Scaling

### Horizontal Scaling

Increase instances in Spaceship Hyperlift dashboard:
```
Instances: 1 → 3
```

### Vertical Scaling

Increase resources per instance:
```
CPU: 0.5 → 1.0 vCPU
Memory: 1GB → 2GB
```

## Security

### Environment Variables

- ✅ Never commit `.env` files
- ✅ Use Spaceship Hyperlift's secret management
- ✅ Rotate keys regularly

### CORS

The service allows all origins by default for development. For production, consider restricting CORS:

Edit `server.js` to restrict origins:
```javascript
res.setHeader('Access-Control-Allow-Origin', 'https://your-app-domain.com');
```

### API Rate Limiting

Consider adding rate limiting in production:
```javascript
// Add rate limiting middleware
const rateLimit = require('express-rate-limit');
```

## Support

For issues:
1. Check the logs first
2. Review environment variables
3. Test endpoints locally with Docker
4. Contact Spaceship Hyperlift support

---

**Last Updated**: October 13, 2025  
**Version**: 1.0.0  
**Dockerfile Version**: Node 20 Alpine

