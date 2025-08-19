# 🚀 Deploy Stripe Guardian to Render

This guide will help you deploy the Stripe Guardian to Render for continuous monitoring in production.

## 📋 Prerequisites

- [Render account](https://render.com) (free tier available)
- Your Stripe Guardian code in a Git repository
- Environment variables ready

## 🔧 Step-by-Step Deployment

### **Step 1: Push Code to GitHub**

Make sure your code is committed and pushed to GitHub:

```bash
git add .
git commit -m "Add Render deployment configuration"
git push origin main
```

### **Step 2: Connect to Render**

1. **Go to [Render Dashboard](https://dashboard.render.com)**
2. **Click "New +"**
3. **Select "Web Service"**
4. **Connect your GitHub repository**

### **Step 3: Configure the Service**

Use these settings:

- **Name**: `stripe-guardian`
- **Environment**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `node scripts/auto-stripe-guardian-render.js`
- **Plan**: `Free` (or choose paid if you need more resources)

### **Step 4: Set Environment Variables**

Add these environment variables in Render:

| Key | Value | Description |
|-----|-------|-------------|
| `NODE_ENV` | `production` | Production environment |
| `STRIPE_SECRET_KEY` | `sk_live_...` | Your Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Your Stripe webhook secret |
| `SUPABASE_URL` | `https://...` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Your Supabase service role key |
| `WEBHOOK_PORT` | `3001` | Port for the service |

### **Step 5: Deploy**

1. **Click "Create Web Service"**
2. **Wait for the build to complete**
3. **Your service will be available at**: `https://stripe-guardian.onrender.com`

## 🌐 Health Check Endpoints

Once deployed, you can monitor your guardian:

- **Health Check**: `https://stripe-guardian.onrender.com/health`
- **Readiness**: `https://stripe-guardian.onrender.com/ready`

## 📊 Monitoring

### **Render Dashboard**
- View logs in real-time
- Monitor resource usage
- Check deployment status

### **Guardian Logs**
- Access logs via Render dashboard
- Guardian creates daily log files
- Monitor customer sync issues

## 🔄 Auto-Deployment

The service is configured to automatically deploy when you push to your main branch.

## 🚨 Troubleshooting

### **Common Issues**

#### **Build Fails**
```bash
# Check if all dependencies are in package.json
npm install

# Verify Node.js version compatibility
node --version
```

#### **Service Won't Start**
```bash
# Check environment variables are set
# Verify Stripe and Supabase credentials
# Check logs in Render dashboard
```

#### **Health Check Fails**
```bash
# Verify the service is running
# Check environment variables
# Review guardian logs
```

### **Debug Commands**

```bash
# Test locally first
node scripts/auto-stripe-guardian-render.js

# Check environment variables
echo $STRIPE_SECRET_KEY
echo $SUPABASE_URL
```

## 🔗 Integration with Vercel

### **Architecture**
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Vercel API    │    │  Render Guardian │    │   Stripe API    │
│   (Serverless)  │◄──►│  (Continuous)    │◄──►│                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Supabase DB   │    │   Guardian Logs  │    │  Webhook Events │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### **Benefits**
- **Vercel**: Handles API requests (serverless, auto-scaling)
- **Render**: Runs guardian continuously (monitoring, auto-fixes)
- **Both**: Connect to same Stripe and Supabase

## 📈 Scaling

### **Free Tier Limits**
- **750 hours/month** (enough for continuous operation)
- **512 MB RAM**
- **Shared CPU**

### **Upgrade When Needed**
- **Starter**: $7/month - 1GB RAM, dedicated CPU
- **Standard**: $25/month - 2GB RAM, better performance

## 🔒 Security

### **Environment Variables**
- All sensitive data stored in Render environment variables
- Never commit secrets to Git
- Use Render's secure variable storage

### **Access Control**
- Service only accessible via health check endpoints
- No sensitive data exposed in responses
- Guardian runs with minimal required permissions

## 📝 Maintenance

### **Regular Tasks**
1. **Monitor logs** for any issues
2. **Check health endpoints** regularly
3. **Review Stripe dashboard** for sync status
4. **Update dependencies** as needed

### **Updates**
```bash
# Push changes to GitHub
git push origin main

# Render will auto-deploy
# Monitor deployment in dashboard
```

## 🎯 What Happens After Deployment

1. **Guardian starts automatically** on Render
2. **Health checks run every 2 minutes**
3. **Auto-fixes run every 5 minutes**
4. **Webhook events are monitored**
5. **Customer sync issues are fixed automatically**
6. **Logs are available in Render dashboard**

## 🚀 Next Steps

After deployment:

1. **Test health endpoints**
2. **Monitor guardian logs**
3. **Verify customer sync is working**
4. **Set up alerts if needed**
5. **Deploy your APIs to Vercel**

## 📞 Support

- **Render Support**: [docs.render.com](https://docs.render.com)
- **Guardian Issues**: Check logs and environment variables
- **Stripe Issues**: Verify API keys and webhook configuration

---

**Your Stripe Guardian will now run continuously in production, automatically protecting your Stripe integration! 🛡️**
