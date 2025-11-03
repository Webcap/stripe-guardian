# Harbor Registry Cleanup Guide

## Current Situation
- Registry storage limit: **4.0 GiB**
- Current usage: **4.0 GiB** (at limit)
- New image size: **97.6 MiB** (will exceed limit)

## Immediate Actions Required

### 1. Access Harbor Registry

1. Navigate to: `https://harbor-hyperlift.namecheapcloud.net`
2. Log in with your credentials
3. Go to: **Projects** → **production-hyperlift-3334** → **hyperlift-3334**

### 2. Identify Old Images to Delete

**Check image tags:**
- Look for old `latest` tags (keep only the most recent)
- Find development/test tags (e.g., `dev`, `test`, `staging`)
- Identify old version tags (e.g., `v1.0.0`, `v1.0.1` - keep only last 2-3)

**Check cache layers:**
- Harbor stores build cache layers separately
- Check **Artifacts** tab for old/unused layers
- Delete cache layers older than 30 days

### 3. Delete Old Images

**For each old image:**
1. Click on the image
2. Select **Delete** option
3. Confirm deletion
4. Wait for Harbor to process (may take a few minutes)

**Expected space freed:**
- Old images: ~500 MB - 1.5 GB
- Old cache layers: ~500 MB - 1 GB
- **Total expected**: 1-2.5 GB freed

### 4. Verify Storage After Cleanup

1. Check **Storage Quota** in project settings
2. Should show: **~2-3 GiB used** (down from 4.0 GiB)
3. You should now have **~1-2 GiB free space**

## Alternative: Use Docker Prune Locally (Before Push)

If you have access to Harbor API or CLI:

```bash
# Login to Harbor
docker login harbor-hyperlift.namecheapcloud.net

# List images
docker images | grep hyperlift-3334

# Remove old images locally (if any)
docker image prune -a --filter "until=168h" # Older than 7 days
```

## Prevention for Future

### 1. Set Up Harbor Retention Policy

In Harbor project settings:
- **Retention Policy**: Keep last 5 tags
- **Auto-delete**: Images older than 30 days
- **Cache cleanup**: Delete cache layers older than 7 days

### 2. Use Image Tagging Strategy

Instead of always using `latest`:
- Use semantic versioning: `v1.0.0`, `v1.0.1`
- Tag with date: `2025-11-03`
- Keep only last 3-5 versions

### 3. Regular Cleanup Schedule

- Weekly: Review and delete old images
- Monthly: Clean up cache layers
- Quarterly: Review storage usage

## After Cleanup

1. **Verify space**: Should have > 500 MB free
2. **Rebuild image**: Use optimized Dockerfile
3. **Push image**: Should succeed now
4. **Monitor**: Check storage usage regularly

## Contact Harbor Admin

If cleanup doesn't free enough space:
- Request quota increase to 8.0 GiB or higher
- Request retention policy setup
- Request automatic cleanup configuration

## Quick Reference

**Registry URL**: `harbor-hyperlift.namecheapcloud.net`  
**Project**: `production-hyperlift-3334/hyperlift-3334`  
**Current Limit**: 4.0 GiB  
**Target Free Space**: > 500 MB

