FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    curl \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./

# Install dependencies with legacy peer deps for compatibility
RUN npm ci --only=production --legacy-peer-deps

# Copy application code
COPY scripts/ ./scripts/
COPY server/ ./server/

# Create logs directory
RUN mkdir -p logs

# Create a default .env file if none exists (for Docker builds)
RUN echo "# Stripe Guardian Environment Variables\n# Update these values in your deployment environment\nSTRIPE_SECRET_KEY=your_stripe_secret_key_here\nSTRIPE_WEBHOOK_SECRET=your_webhook_secret_here\nSUPABASE_URL=your_supabase_url_here\nSUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here\nWEBHOOK_PORT=3001" > .env

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3001/ready || exit 1

# Start the guardian
CMD ["node", "scripts/auto-stripe-guardian.js"]
