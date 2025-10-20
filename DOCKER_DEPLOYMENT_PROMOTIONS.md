# Docker Production Deployment - Promotion System

## ✅ Docker Environment Status

### Good News! 🎉

Your `Dockerfile` automatically copies all the directories with our changes:

```dockerfile
COPY api/ ./api/          # ✅ Includes 4 new promotion endpoints
COPY server/ ./server/    # ✅ Includes updated StripeService
COPY services/ ./services/# ✅ Includes subscription-sync
COPY server.js ./         # ✅ Includes new routes and CORS fix
```

**All promotion changes WILL be included** when you rebuild the Docker image!

---

## 🚀 Deploy to Docker Production

### Step 1: Verify Environment Variables

Check your `.env` file or docker-compose environment:

```bash
# Required variables (check docker-compose.yml or .env)
STRIPE_SECRET_KEY=sk_live_... or sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
WIZNOTE_SUPABASE_URL=https://...supabase.co
WIZNOTE_SUPABASE_SECRET_KEY=eyJ... (service role key)
```

### Step 2: Build New Docker Image

```bash
cd stripe-guardian

# Stop current container
docker-compose down

# Rebuild with latest changes
docker-compose build --no-cache

# Start updated container
docker-compose up -d
```

**Or in one command:**
```bash
docker-compose down && docker-compose build --no-cache && docker-compose up -d
```

### Step 3: Verify Deployment

**Check container is running:**
```bash
docker ps | grep stripe-guardian
```

Expected output:
```
CONTAINER ID   IMAGE                       STATUS         PORTS
abc123def456   stripe-guardian_stripe...   Up 30 seconds  0.0.0.0:3001->3001/tcp
```

**Check logs:**
```bash
docker-compose logs -f stripe-guardian
```

Expected output:
```
🚀 Stripe Guardian API Server running on port 8080
📍 Health check: http://localhost:8080/api/health
📍 Ready check: http://localhost:8080/api/ready
...
```

**Test health endpoint:**
```bash
curl http://localhost:3001/api/health
# Or if using different port mapping:
curl http://your-server:3001/api/health
```

Expected: `{"status":"ok",...}`

### Step 4: Test Promotion Endpoints

**Test coupon validation:**
```bash
curl -X POST http://localhost:3001/api/stripe/validate-coupon \
  -H "Content-Type: application/json" \
  -d '{"code":"TEST123"}'
```

**Test from your app:**
```javascript
// In browser console
fetch('http://your-production-domain:3001/api/ready')
  .then(r => r.json())
  .then(console.log);
```

---

## 📋 Environment Variable Checklist

### Required for Promotions:

Same as before - no new env vars needed! ✅

- [x] `STRIPE_SECRET_KEY` - For creating coupons
- [x] `STRIPE_WEBHOOK_SECRET` - For webhook verification
- [x] `WIZNOTE_SUPABASE_URL` - To access promotions table
- [x] `WIZNOTE_SUPABASE_SECRET_KEY` - Service role for admin operations

### Optional for Enhanced Features:

- [ ] `NODE_ENV=production` - Already in docker-compose.yml ✅

---

## 🔧 Docker Deployment Options

### Option 1: Docker Compose (Easiest)

```bash
# Full rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# View logs
docker-compose logs -f
```

### Option 2: Manual Docker Commands

```bash
# Build image
docker build -t stripe-guardian:latest .

# Stop old container
docker stop stripe-guardian
docker rm stripe-guardian

# Run new container
docker run -d \
  --name stripe-guardian \
  -p 3001:8080 \
  --env-file .env \
  stripe-guardian:latest

# Check logs
docker logs -f stripe-guardian
```

### Option 3: Docker with Health Check

```bash
# Build and start
docker-compose up -d --build

# Wait for health check to pass
docker inspect stripe-guardian --format='{{.State.Health.Status}}'

# Should show: "healthy"
```

---

## 🌐 Production URLs

After Docker deployment, your endpoints will be:

**Base URL:** `http://your-server-ip:3001` or `https://your-domain.com`

**Promotion Endpoints:**
- `POST /api/stripe/create-coupon`
- `POST /api/stripe/create-promotion-code`
- `POST /api/stripe/create-discounted-price`
- `GET|POST /api/stripe/validate-coupon`

**Updated Endpoints:**
- `POST /api/stripe/create-checkout` (now accepts couponId)
- `POST /api/stripe/create-paymentsheet` (now accepts couponId)
- `POST /api/stripe/confirm-paymentsheet` (applies coupon)

---

## 📊 Summary: Both Environments

### Local (stripe-guardian workspace):
✅ All changes present  
✅ Ready to deploy  
✅ 9 files modified, 4 new files  

### Render (https://stripe-guardian.onrender.com):
⚠️ Needs git push to deploy  
📝 See: `DEPLOYMENT_CHECKLIST_PROMOTIONS.md`  

### Docker (Your production server):
⚠️ Needs `docker-compose build` to update  
📝 See above for commands  
✅ Dockerfile already configured correctly  

---

## 🎯 To Deploy to Docker Production:

```bash
cd stripe-guardian
docker-compose down
docker-compose build --no-cache
docker-compose up -d
docker-compose logs -f stripe-guardian
```

Wait ~30 seconds, then test:
```bash
curl http://localhost:3001/api/health
```

That's it! Your Docker production will have all promotion features! 🎉
