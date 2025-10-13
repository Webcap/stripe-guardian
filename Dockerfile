FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    curl \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./

# Install dependencies (including dev for serverless runtime)
RUN npm ci --legacy-peer-deps

# Copy application code
COPY api/ ./api/
COPY scripts/ ./scripts/
COPY server/ ./server/
COPY public/ ./public/
COPY server.js ./

# Create logs directory
RUN mkdir -p logs

# Create a default .env file if none exists (for Docker builds)
RUN echo "# Stripe Guardian Environment Variables\n# Update these values in your deployment environment\nSTRIPE_SECRET_KEY=your_stripe_secret_key_here\nSTRIPE_WEBHOOK_SECRET=your_webhook_secret_here\nSUPABASE_URL=your_supabase_url_here\nSUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here\nPORT=3001" > .env

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port (use PORT env variable or default to 3001)
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3001}/api/health || exit 1

# Start the API server
CMD ["node", "server.js"]
