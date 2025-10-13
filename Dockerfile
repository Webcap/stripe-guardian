FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy package files first (for better layer caching)
COPY package*.json ./

# Install ONLY production dependencies to keep image small
RUN npm ci --only=production --legacy-peer-deps && \
    npm cache clean --force

# Copy application code
COPY api/ ./api/
COPY services/ ./services/
COPY server.js ./

# Create logs directory
RUN mkdir -p logs

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
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
