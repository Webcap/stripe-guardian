# Multi-stage build to minimize final image size
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (for better layer caching)
COPY package*.json ./

# Install ONLY production dependencies
RUN npm ci --only=production --legacy-peer-deps && \
    npm cache clean --force && \
    rm -rf /tmp/* /var/cache/apk/*

# Runtime stage - minimal image
FROM node:20-alpine

WORKDIR /app

# Install curl for health checks (minimal install)
RUN apk add --no-cache curl && \
    rm -rf /var/cache/apk/* /tmp/*

# Copy dependencies from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy only necessary application code
COPY api/ ./api/
COPY server/ ./server/
COPY services/ ./services/
COPY server.js ./

# Create logs directory and set permissions
RUN mkdir -p logs && \
    # Create non-root user for security
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

# Start the server
CMD ["node", "server.js"]
