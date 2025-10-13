# Stripe Webhook Handler Fix

## Issue
The Stripe webhook endpoint at `/api/stripe/webhook` was failing with the error:
```
TypeError: handler is not a function
at IncomingMessage.<anonymous> (/app/server.js:74:13)
```

## Root Cause
The `webhook.js` file was using ES6 module syntax (`import`/`export default`) while `server.js` uses CommonJS (`require()`/`module.exports`). When Node.js requires an ES module with `require()`, the default export isn't directly callable as a function.

## Changes Made

### 1. Converted webhook.js to CommonJS (Lines 1-3)
**Before:**
```javascript
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
```

**After:**
```javascript
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
```

### 2. Changed Export Syntax (Line 451)
**Before:**
```javascript
export default async function handler(req, res) {
```

**After:**
```javascript
module.exports = async (req, res) => {
```

### 3. Replaced Express Methods with Native HTTP (Throughout handler)
The webhook handler was using Express.js-style methods that don't exist in native Node.js HTTP:

**Before:**
```javascript
return res.status(400).json({ error: 'Missing header' });
```

**After:**
```javascript
res.writeHead(400, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'Missing header' }));
```

### 4. Fixed Body Handling
The webhook was trying to read the request stream, but `server.js` already consumes it:

**Before:**
```javascript
let rawBody = '';
req.on('data', (chunk) => {
    rawBody += chunk.toString();
});
req.on('end', async () => {
    // Process webhook...
});
```

**After:**
```javascript
// Get the raw body from req.rawBody (already read by server.js)
const rawBody = req.rawBody || req.body;
```

### 5. Updated server.js to Preserve Raw Body (Lines 54-55)
For Stripe webhook signature verification, the raw unparsed body string is required:

```javascript
// Store raw body (needed for webhook signature verification)
req.rawBody = body;

// Parse body if present
if (body) {
  try {
    req.body = JSON.parse(body);
  } catch (e) {
    req.body = body;
  }
}
```

### 6. Removed Vercel-Specific Configuration
Removed the following since it's not needed for the custom server:
```javascript
export const config = {
    api: {
        bodyParser: false,
    },
};
```

## Result
The webhook endpoint now:
- ✅ Uses CommonJS modules compatible with `server.js`
- ✅ Uses native Node.js HTTP methods (`writeHead`, `end`)
- ✅ Properly handles the raw body for signature verification
- ✅ No longer throws "handler is not a function" error

## Testing
After deploying, Stripe webhooks should now be processed successfully. Monitor the logs for:
```
Handling webhook event: [event.type]
```

Instead of the previous error.

