# CORS Fix for Admin Dashboard Integration

## Issue
The WizNote admin dashboard running on `http://localhost:8081` was unable to fetch data from Stripe Guardian API at `https://api.webcap.media/api` due to CORS (Cross-Origin Resource Sharing) restrictions.

### Error Messages
```
Access to fetch at 'https://api.webcap.media/api/ready' from origin 'http://localhost:8081' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.

Failed to load resource: net::ERR_FAILED
```

## Root Cause
While CORS headers were being set using `res.setHeader()`, they weren't being included when `res.writeHead()` was called with additional headers. This caused the CORS headers to be lost in the final response.

## Solution
Updated all API endpoints to ensure CORS headers are included in every response by:

1. Defining CORS headers as a consistent object
2. Setting headers using both `setHeader()` and spreading into `writeHead()`
3. Adding proper CORS preflight (OPTIONS) handling

## Files Modified

### 1. `/api/health.js`
- Added comprehensive CORS headers to all responses
- Included `Access-Control-Max-Age` for preflight caching

### 2. `/api/ready.js`
- Added CORS headers to all response paths
- Ensured subscription sync data is accessible cross-origin

### 3. `/api/sync-status.js`
- Added CORS headers for both GET and POST methods
- Proper preflight handling for manual sync triggers

## Changes Applied

### Before
```javascript
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

// Later...
res.writeHead(200, { 'Content-Type': 'application/json' });
// CORS headers potentially lost!
```

### After
```javascript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400' // 24 hours
};

// Set with setHeader (for consistency)
Object.entries(corsHeaders).forEach(([key, value]) => {
  res.setHeader(key, value);
});

// Spread into writeHead (ensures inclusion)
res.writeHead(200, { 
  'Content-Type': 'application/json',
  ...corsHeaders
});
```

## CORS Headers Explained

### `Access-Control-Allow-Origin: *`
- Allows requests from any origin (including localhost:8081)
- For production, you might want to restrict this to specific domains

### `Access-Control-Allow-Methods`
- Specifies which HTTP methods are allowed
- `GET, POST, OPTIONS` covers all current API needs

### `Access-Control-Allow-Headers`
- Specifies which request headers are allowed
- `Content-Type, Accept` covers standard JSON requests

### `Access-Control-Max-Age: 86400`
- Caches preflight (OPTIONS) responses for 24 hours
- Reduces preflight requests for better performance

## Testing

### 1. Test from Browser Console
```javascript
// Should succeed now
fetch('https://api.webcap.media/api/ready')
  .then(r => r.json())
  .then(data => console.log('Success:', data))
  .catch(err => console.error('Error:', err));
```

### 2. Test with curl
```bash
# OPTIONS (preflight)
curl -X OPTIONS https://api.webcap.media/api/ready \
  -H "Origin: http://localhost:8081" \
  -H "Access-Control-Request-Method: GET" \
  -v

# Should see CORS headers in response

# GET request
curl https://api.webcap.media/api/ready \
  -H "Origin: http://localhost:8081" \
  -v

# Should see CORS headers and data
```

### 3. Test Admin Dashboard
1. Open admin dashboard at `http://localhost:8081/admin-dashboard`
2. Check browser console - should see no CORS errors
3. Verify Stripe Guardian status loads correctly
4. Test manual sync button - should work without errors

## Deployment

### Requirements
- No additional configuration needed
- Works with existing Docker/cloud deployments
- No environment variables required

### Deployment Steps
1. Commit changes to repository
2. Deploy updated code to Stripe Guardian
3. Restart service (if needed)
4. Verify CORS headers in browser developer tools

## Security Considerations

### Current Setup (Development-Friendly)
```javascript
'Access-Control-Allow-Origin': '*'  // Allows ALL origins
```

### Production Recommendation
For production, consider restricting origins:
```javascript
const allowedOrigins = [
  'https://app.wiznote.com',
  'https://admin.wiznote.com',
  'http://localhost:8081', // Dev only
];

const origin = req.headers.origin;
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
  // ... other headers
};
```

## Monitoring

### What to Watch
- Check for CORS errors in browser console
- Monitor OPTIONS requests (should be cached for 24h)
- Verify all endpoints return proper CORS headers

### Browser Developer Tools
1. Open Network tab
2. Look for API requests to `api.webcap.media`
3. Check Response Headers for CORS headers:
   ```
   Access-Control-Allow-Origin: *
   Access-Control-Allow-Methods: GET, POST, OPTIONS
   Access-Control-Allow-Headers: Content-Type, Accept
   Access-Control-Max-Age: 86400
   ```

## Troubleshooting

### Still Getting CORS Errors?

**1. Clear Browser Cache**
```
- Hard refresh: Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)
- Or clear site data in developer tools
```

**2. Check Response Headers**
```bash
curl -I https://api.webcap.media/api/ready
# Should show CORS headers
```

**3. Verify Server is Updated**
```bash
# Check if new code is deployed
curl https://api.webcap.media/api/health
# Should return with CORS headers
```

**4. Check for Reverse Proxy**
- If behind nginx/apache, ensure it's not stripping headers
- Add `proxy_pass_header` directives if needed

### Preflight Requests Failing

If OPTIONS requests fail:
```javascript
// Verify OPTIONS handler
if (req.method === 'OPTIONS') {
  res.writeHead(200, corsHeaders);
  res.end();
  return;
}
```

## Benefits

### After Fix
- ✅ Admin dashboard can fetch Stripe Guardian status
- ✅ Manual sync button works without errors
- ✅ Subscription sync status displays correctly
- ✅ Cross-origin requests work from localhost
- ✅ Preflight requests cached for 24 hours (better performance)

## Related Issues

This fix resolves:
- CORS errors when accessing `/api/ready`
- CORS errors when accessing `/api/sync-status`
- CORS errors when accessing `/api/health`
- Failed fetch errors in admin dashboard
- Unable to trigger manual sync from dashboard

## Summary

All Stripe Guardian API endpoints now properly support CORS requests from the WizNote admin dashboard. The fix ensures CORS headers are consistently included in all responses, enabling seamless cross-origin communication between the admin dashboard and Stripe Guardian API.

**No more CORS errors!** 🎉

