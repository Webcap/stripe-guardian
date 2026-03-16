# Stripe Guardian 🛡️

A robust, automated monitoring and synchronization system for Stripe subscriptions that ensures data consistency between your Stripe account and Supabase database. Built with Node.js and designed for production reliability.

## 🎯 What is Stripe Guardian?

Stripe Guardian is an intelligent monitoring system that:
- **Automatically detects** and **fixes** Stripe sync issues
- **Prevents duplicate subscriptions** and customer creation
- **Monitors webhook health** and auto-restarts failed services
- **Provides real-time monitoring** with Grafana dashboards
- **Ensures data consistency** between Stripe and your database

## ✨ Key Features

### 🔄 Automatic Subscription Sync
- **Built-in automatic sync** every 10 minutes - no separate process needed
- Syncs active subscriptions from Stripe to database
- Detects and deactivates expired subscriptions
- Handles canceled subscriptions automatically
- Manual sync trigger via API endpoint
- Real-time status monitoring at `/api/sync-status`

### 🔄 Automatic Synchronization
- Continuous monitoring of Stripe-Supabase data consistency
- Automatic detection and resolution of sync issues
- Real-time webhook processing for subscription events

### 🚫 Duplicate Prevention
- Prevents users from creating multiple subscriptions
- Blocks duplicate customer creation
- Maintains subscription state integrity

### 🏥 Health Monitoring
- Built-in health checks for webhook server
- Automatic restart of failed services
- Comprehensive logging and error tracking
- Subscription sync status in ready checks

### 🚀 Production Ready
- Local development with npm scripts
- Health checks and auto-restart policies
- Monitoring dashboard with Grafana
- **Vercel deployment** for production webhooks
- Optional Docker deployment for production

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Stripe API    │◄──►│  Webhook Server  │◄──►│   Supabase DB   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       ▼                       │
         │              ┌──────────────────┐             │
         └──────────────►│  Auto Guardian  │◄────────────┘
                         │   (Monitor)     │
                         └──────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js 20+ (required for package compatibility)
- Stripe account with API keys
- Supabase project with service role key

**Note**: This setup guide focuses on local development. Docker is optional and only needed for production deployment.

### 🎯 Simple Setup (No Docker)
1. **Install dependencies**: `npm install`
2. **Create `.env` file** with your credentials
3. **Start services**: `npm run dev:stripe`
4. **Access webhook**: `http://localhost:3001/health`

### 1. Clone and Install
```bash
git clone <your-repo>
cd stripe-guardian
npm install
```

### 2. Environment Setup

#### For Local Development
Create a `.env` file with your credentials:
```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Webhook Server
WEBHOOK_PORT=3001
```

#### For Docker Deployment
The Docker container will create a default `.env` file. You can override environment variables using:
```bash
# Method 1: Docker run with environment variables
docker run -d \
  -e STRIPE_SECRET_KEY=sk_test_... \
  -e STRIPE_WEBHOOK_SECRET=whsec_... \
  -e SUPABASE_URL=https://your-project.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=eyJ... \
  -p 3001:3001 \
  stripe-guardian

# Method 2: Docker Compose with .env file
# Create .env file and docker-compose will use it automatically
```

### 3. Start the System

#### Local Development (Recommended)
```bash
# Start webhook server
npm run webhook:dev

# Start guardian in another terminal
npm run stripe:guardian

# Or run both together
npm run dev:stripe
```

#### Windows Development
```bash
# Start webhook server
npm run webhook:dev

# Start guardian in another terminal
npm run stripe:guardian

# For Windows, use the webhook + guardian combination
npm run dev:stripe
```

#### Deploy to Vercel (Production)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to Vercel
vercel

# Set environment variables in Vercel dashboard
# STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

# Update Stripe webhook URL to your Vercel domain
# https://your-app.vercel.app/webhook
```

## 📋 Available Scripts

### Core Operations
```bash
npm run stripe:guardian          # Start the auto guardian
npm run webhook:dev             # Start webhook server
npm run stripe:health-check     # Run health check
npm run stripe:monitor          # Monitor webhook events
```

### Development
```bash
npm run dev:full               # Start all services
npm run dev:webhook            # Start webhook + app
npm run dev:stripe             # Start guardian + app
```

### Docker Management (Optional)
```bash
npm run stripe:guardian:docker # Start with Docker
npm run stripe:guardian:stop   # Stop Docker services
```

**Note**: Docker is optional and only needed for production deployment. For local development, use the npm scripts above.

## 🔧 Configuration

### Guardian Settings
The auto guardian can be configured in `scripts/auto-stripe-guardian.js`:

```javascript
const CONFIG = {
  healthCheckIntervalMs: 2 * 60 * 1000,  // 2 minutes
  autoFixIntervalMs: 5 * 60 * 1000,      // 5 minutes
  webhookServerPort: 3001,
  maxRetries: 3,
  retryDelayMs: 10000,                   // 10 seconds
};
```

### Webhook Server
- **Port**: Configurable via `WEBHOOK_PORT` env var
- **Health Endpoints**: `/health` and `/ready`
- **CORS**: Enabled for development
- **Auto-restart**: Built-in process management

## 📊 Monitoring

### API Endpoints
- **Health Check**: `GET /api/health` - Basic health status
- **Ready Check**: `GET /api/ready` - Detailed readiness with sync status
- **Sync Status**: `GET /api/sync-status` - Subscription sync information
- **Manual Sync**: `POST /api/sync-status` - Trigger immediate sync

### Health Checks
- **Webhook Server**: `GET /health` and `GET /ready`
- **Guardian Status**: Continuous monitoring with auto-fix
- **Subscription Sync**: Automatic every 10 minutes

### Logging
- **File Logs**: Daily log files in `logs/` directory
- **Console Output**: Real-time logging to console
- **Sync Logs**: Detailed sync operations and results

### Grafana Dashboard
Access monitoring dashboard at `http://localhost:3000`:
- Username: `admin`
- Password: `admin`
- Pre-configured Stripe metrics and alerts

## 🐛 Troubleshooting

### Common Issues

#### Webhook Server Won't Start
```bash
# Check environment variables
npm run stripe:health-check

# Check logs (running locally)
# Logs will appear in the console and logs/ directory
```

#### Stripe Sync Issues
```bash
# Run manual health check
npm run stripe:health-check

# Check specific customer
npm run stripe:find-customer
```

#### Database Connection Issues
```bash
# Verify Supabase credentials
# Check RLS policies
# Ensure service role key has proper permissions
```

### Debug Mode
Enable verbose logging by setting:
```bash
NODE_ENV=development
DEBUG=stripe-guardian:*
```

### Docker Build Issues (Optional)

**Note**: Docker is only needed for production deployment. For local development, skip this section.

If you encounter Docker build issues:
```bash
# The Dockerfile handles most issues automatically
# For production deployment, refer to Docker documentation
# For local development, use npm scripts instead
```

### Windows-Specific Issues

#### Environment Variable Syntax
On Windows, the `APP_VARIANT=development` syntax may not work. Use:
```bash
# Windows CMD
set APP_VARIANT=development && npx expo start

# Windows PowerShell
$env:APP_VARIANT="development"; npx expo start

# Or use the provided npm scripts that handle this automatically
npm run dev:stripe
```

#### Docker Compose Not Found
If `docker-compose` is not recognized:
1. Install Docker Desktop for Windows
2. Ensure Docker is running
3. Use `docker compose` (without hyphen) for newer Docker versions
4. For local development, you can run services without Docker

## 🔒 Security

- **Environment Variables**: All sensitive data stored in `.env`
- **Service Role Key**: Required for database operations
- **Webhook Verification**: Stripe signature validation
- **Non-root User**: Docker containers run as non-root

## 📁 Project Structure

```
stripe-guardian/
├── server/                    # Webhook server implementation
│   ├── webhook-server.js     # Main webhook handler
│   ├── services/             # Stripe service layer
│   └── lib/                  # Utility libraries
├── scripts/                   # Guardian and utility scripts
│   ├── auto-stripe-guardian.js  # Main guardian script
│   └── stripe-health-check.js   # Health check utilities
├── monitoring/                # Grafana configuration
├── docker-compose.yml         # Docker orchestration
├── Dockerfile                 # Container definition
└── logs/                      # Application logs
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For issues and questions:
- Check the troubleshooting section above
- Review the logs in `logs/` directory
- Open an issue on GitHub
- Check Stripe and Supabase documentation

## 🚀 Vercel Deployment

### Quick Deploy
1. **Push to GitHub** - Ensure your code is in a GitHub repository
2. **Connect to Vercel** - Go to [vercel.com](https://vercel.com) and import your repo
3. **Set Environment Variables** - Add your Stripe and Supabase credentials
4. **Deploy** - Vercel will automatically deploy your webhook server

### Environment Variables in Vercel
Set these in your Vercel project settings:
- `STRIPE_SECRET_KEY` - Your Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Your Stripe webhook secret
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key

### Update Stripe Webhook URL
After deployment, update your Stripe webhook endpoint to:
```
https://your-app-name.vercel.app/webhook
```

**Note**: The webhook is deployed as `/api/webhook` but accessible at `/webhook` for convenience.

### Local Guardian + Vercel Webhook
You can run the guardian locally while using the Vercel-hosted webhook:
```bash
# Start local guardian (connects to Vercel webhook)
npm run stripe:guardian

# Guardian will monitor the Vercel webhook endpoint
```

## 🚀 AWS EC2 Docker Deployment with Nginx

Stripe Guardian is perfectly suited to run on an AWS EC2 instance using Docker Compose. The repository includes a `docker-compose.yml` that sets up the Node.js API, an Nginx reverse proxy, and an optional Grafana monitoring dashboard.

### Quick Deploy
1. **Launch an EC2 Instance** - We recommend using Amazon Linux 2023 or Ubuntu 22.04 LTS. Open port `80` (HTTP API) and optionally port `3000` (Grafana) in the Security Group.
2. **Setup the Instance** - SSH into your instance and run the pre-built setup script (or install Docker and Docker Compose manually):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/Webcap/stripe-guardian/main/scripts/ec2-setup.sh | bash
   ```
3. **Configure Environment Variables** - Inside the `stripe-guardian` directory, create a `.env` file and add your credentials:
   ```env
   STRIPE_SECRET_KEY=sk_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   SUPABASE_URL=https://...
   SUPABASE_SERVICE_ROLE_KEY=ey...
   WIZNOTE_SUPABASE_SERVICE_KEY=ey...
   ```
4. **Start the Application** - Run Docker Compose in detached mode:
   ```bash
   docker-compose up -d
   ```

### Update Stripe Webhook URL
After deployment, update your Stripe webhook endpoint to the Elastic IP or custom domain mapped to your EC2 instance (which now routes through Nginx on port 80!):
```
http://<YOUR_EC2_IP>/api/webhook
```

---

**Built with ❤️ for reliable Stripe integration**

