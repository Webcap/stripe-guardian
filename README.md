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

### 🐳 Production Ready
- Docker containerization for easy deployment
- Health checks and auto-restart policies
- Monitoring dashboard with Grafana

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
- Docker and Docker Compose (for production deployment)
- Stripe account with API keys
- Supabase project with service role key

**Note**: For Windows development, Docker is optional. You can run the services locally using Node.js.

### 1. Clone and Install
```bash
git clone <your-repo>
cd stripe-guardian
npm install
```

### 2. Environment Setup
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

### 3. Start the System

#### Option A: Docker (Recommended for Production)
```bash
# Build and start all services
docker-compose up -d --build

# View logs
docker-compose logs -f stripe-guardian

# Stop services
docker-compose down

# Rebuild if you make changes
docker-compose build --no-cache
```

#### Option B: Local Development
```bash
# Start webhook server
npm run webhook:dev

# Start guardian in another terminal
npm run stripe:guardian

# Or run both together
npm run dev:stripe
```

#### Option C: Windows Development
```bash
# Start webhook server
npm run webhook:dev

# Start guardian in another terminal
npm run stripe:guardian

# For Windows, use the webhook + guardian combination
npm run dev:stripe
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

### Docker Management
```bash
npm run stripe:guardian:docker # Start with Docker
npm run stripe:guardian:stop   # Stop Docker services
```

**Note**: Docker commands require Docker Desktop to be installed and running. For Windows users, ensure Docker Desktop is properly configured.

### Docker Build Commands
```bash
# Build the image
docker build -t stripe-guardian .

# Build with no cache (if you encounter issues)
docker build --no-cache -t stripe-guardian .

# Run the built image
docker run -d --name stripe-guardian -p 3001:3001 stripe-guardian
```

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

### Health Checks
- **Webhook Server**: `GET /health` and `GET /ready`
- **Docker Health**: Built-in container health checks
- **Guardian Status**: Continuous monitoring with auto-fix

### Logging
- **File Logs**: Daily log files in `logs/` directory
- **Console Output**: Real-time logging to console
- **Docker Logs**: Accessible via `docker-compose logs`

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

# Check logs (if using Docker)
docker-compose logs stripe-guardian

# Check logs (if running locally)
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

### Docker Build Issues

#### Node.js Version Compatibility
If you encounter engine warnings during Docker build:
```bash
# The Dockerfile now uses Node.js 20 for compatibility
# If you still see warnings, you can force install with:
docker build --build-arg NODE_OPTIONS="--legacy-peer-deps" -t stripe-guardian .
```

#### Build Cache Issues
If the build fails or you need to rebuild:
```bash
# Clear Docker build cache
docker builder prune

# Rebuild without cache
docker build --no-cache -t stripe-guardian .
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

---

**Built with ❤️ for reliable Stripe integration**
