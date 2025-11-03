# Docker Registry Storage Quota Fix

## Problem
Harbor registry has reached 4.0 GiB storage limit. Cannot push new 97.6 MiB image layer.

## Immediate Solutions

### 1. Clean Up Old Images in Harbor Registry (RECOMMENDED)

**Steps:**
1. Log into Harbor registry: `https://harbor-hyperlift.namecheapcloud.net`
2. Navigate to: `production-hyperlift-3334/hyperlift-3334`
3. Delete old/unused image tags:
   - Keep only the latest 2-3 versions
   - Delete old `latest` tags if they're not in use
   - Delete development/test images
4. Check cache layer usage - delete old cache layers if possible

**Expected Result**: Free up 1-2 GiB of space

### 2. Optimize Dockerfile Further

The Dockerfile is already optimized, but we can make additional improvements:

#### Option A: Multi-Stage Build (Reduces final image size)
```dockerfile
# Stage 1: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production --legacy-peer-deps && \
    npm cache clean --force

# Stage 2: Runtime (smaller base image)
FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache curl && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
COPY --from=builder /app/node_modules ./node_modules
COPY api/ ./api/
COPY server/ ./server/
COPY services/ ./services/
COPY server.js ./
RUN chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1
CMD ["node", "server.js"]
```

#### Option B: Use Distroless Image (Smallest possible)
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production --legacy-peer-deps

FROM gcr.io/distroless/nodejs20-debian12:nonroot
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY api/ ./api/
COPY server/ ./server/
COPY services/ ./services/
COPY server.js ./
EXPOSE 8080
CMD ["server.js"]
```

### 3. Update .dockerignore (Prevent Large Files)

Ensure these are excluded:
```dockerignore
# Large files
node_modules
*.log
*.json.backup
*.md (except deployment docs)

# Build artifacts
dist
build
.cache

# Documentation (large)
docs/
*.md
!DOCKERFILE_OPTIMIZATION.md

# Old deployment files
docker-compose.yml
render.yaml
vercel.json

# Health reports
*.json
!package*.json
```

### 4. Request Storage Quota Increase

Contact Harbor registry administrator to:
- Increase quota from 4.0 GiB to 8.0 GiB or higher
- OR set up automatic cleanup policies for old images

## Long-Term Solutions

### 1. Implement Image Pruning Policy
- Automatically delete images older than 30 days
- Keep only last 5 versions of each tag
- Set up Harbor retention policies

### 2. Use Docker BuildKit Cache
- Configure build cache to reduce push size
- Use external cache mounts

### 3. Consider Alternative Registry
- Docker Hub (free tier: 1 private repo)
- GitHub Container Registry (free for public)
- AWS ECR (pay per GB)
- Google Container Registry

## Quick Fix Commands

### Check Image Size Locally
```bash
docker images stripe-guardian --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
```

### Build Optimized Image
```bash
cd stripe-guardian
docker build --no-cache -t stripe-guardian:optimized .
docker images stripe-guardian:optimized
```

### Clean Local Docker Cache
```bash
docker system prune -a --volumes
```

## Verification

After cleanup:
1. Check registry storage: Should be < 3.5 GiB
2. Build new image: Should be < 150 MB
3. Push to registry: Should succeed

## Next Steps

1. **Immediate**: Clean up old images in Harbor (frees ~1-2 GiB)
2. **Short-term**: Optimize Dockerfile with multi-stage build
3. **Long-term**: Request quota increase or set up auto-cleanup

