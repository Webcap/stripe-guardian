# Changelog - Stripe Guardian

All notable changes to Stripe Guardian will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0]

### Added - 2024-10-14

#### Infrastructure & Security
- **Supabase Secret Keys Support** - Implemented support for new `sb_secret_...` API key format
  - Created `server/lib/supabase-admin.js` for dual database admin operations
  - Provides `supabaseAdmin` for stripe-guardian's own database
  - Provides `wiznoteAdmin` for wiznote's user_profiles database
  - Auto-detects and prefers new secret keys over legacy JWT-based service_role keys
  - Full backward compatibility - legacy keys continue to work seamlessly
  - Helper functions: `getAdminKeyInfo()`, `validateAdminKey()` for both databases
  - Added `SUPABASE_SECRET_KEY` environment variable support
  - Added `WIZNOTE_SUPABASE_SECRET_KEY` environment variable support
  - Updated environment templates with new key formats
  - Comprehensive migration documentation in `SUPABASE_API_KEY_MIGRATION.md`
  - Step-by-step setup guide in `docs/SUPABASE_SECRET_KEYS_SETUP.md`
  - Example usage script: `scripts/example-admin-usage.js`

### Changed

#### Security Improvements
- Enhanced API key security following [Supabase's latest recommendations](https://supabase.com/docs/guides/api/api-keys)
- Improved key rotation capabilities - can now rotate keys independently without downtime
- Better audit trail with logging of which key type is being used for each database
- Browser detection prevents secret keys from working in client-side contexts
- Separate key management for wiznote and stripe-guardian databases

### Technical Details

#### Benefits of New Secret Keys
- ✅ **Individual rotation** - Rotate keys for each database independently
- ✅ **Zero downtime migration** - Run both old and new keys simultaneously
- ✅ **Better security** - Not tied to JWT secret, can revoke individual keys
- ✅ **Separate key management** - Different keys for wiznote vs stripe-guardian databases
- ✅ **Browser protection** - Secret keys won't work in browsers
- ✅ **Easier audit** - Track which key was used for each operation

#### Database Access Pattern
```javascript
// Stripe Guardian's own database (if separate)
const { supabaseAdmin } = require('./server/lib/supabase-admin');

// Wiznote's database (for user_profiles, subscriptions)
const { wiznoteAdmin } = require('./server/lib/supabase-admin');
```

#### Migration Path
- Phase 1: Add `WIZNOTE_SUPABASE_SECRET_KEY` and `SUPABASE_SECRET_KEY` alongside legacy keys
- Phase 2: Test all webhook handlers and API endpoints
- Phase 3: Deploy to production with new environment variables
- Phase 4: Monitor for 24-48 hours
- Phase 5: Remove legacy keys when ready (optional)

#### Files Updated
- `server/lib/supabase-admin.js` - NEW dual admin client with auto key detection
- `env-template.txt` - Added secret key configurations for both databases
- `SUPABASE_API_KEY_MIGRATION.md` - NEW complete migration guide
- `docs/SUPABASE_SECRET_KEYS_SETUP.md` - NEW comprehensive setup guide
- `scripts/example-admin-usage.js` - NEW example script for testing both databases

#### Affected Components
All server-side code automatically uses new keys when available:
- API endpoints: `api/stripe/*.js` (webhooks, checkout, subscriptions)
- Services: `services/subscription-sync.js`
- Webhook server: `server/webhook-server.js`
- Scripts: All admin scripts in `scripts/` folder

### Documentation

#### New Documentation
- Complete migration guide with zero-downtime strategy
- Security best practices for handling dual database keys
- Troubleshooting guide for common issues
- Visual guides for obtaining keys from Supabase dashboard
- Deployment guides for Render, Vercel, and Docker
- Rollback procedures if issues occur

#### Deployment Support
- Render deployment instructions with environment variables
- Vercel deployment instructions with CLI commands
- Docker/Docker Compose configuration examples
- Environment variable naming conventions

---

## [1.0.0] - Existing Release

### Features

#### Core Functionality
- Stripe webhook handling for subscription events
- User subscription management in Supabase
- Payment session creation and verification
- Subscription cancellation and reactivation
- Payment sheet integration for mobile apps
- Customer creation and management
- Plan synchronization with Stripe

#### Security
- Webhook signature verification
- Secure API key management
- Row Level Security bypass for admin operations
- CORS configuration for cross-origin requests

#### Integrations
- Stripe API integration
- Supabase database integration
- Dual database support (stripe-guardian + wiznote)

#### Monitoring & Health Checks
- Health check endpoint (`/api/health`)
- Ready check endpoint (`/api/ready`)
- Environment validation
- Database connectivity checks
- Stripe API connectivity verification

#### Deployment
- Render deployment support
- Vercel deployment support
- Docker containerization
- Docker Compose configuration

---

## Version History

### [Unreleased] - 2024-10-14
- Added Supabase secret keys support with dual database management

### [1.0.0] - Previous Release
- Initial stable release with core webhook and subscription features

---

## Support

For issues, feature requests, or questions:
- Check the migration guides in the `docs/` folder
- Review troubleshooting sections in documentation
- Consult the main README.md for configuration details

---

## Security Notes

### API Key Management
- ❌ **NEVER** commit secret keys to version control
- ❌ **NEVER** use secret keys in client-side code
- ❌ **NEVER** share keys via email, chat, or public channels
- ✅ **ALWAYS** use environment variables for keys
- ✅ **ALWAYS** rotate keys regularly
- ✅ **ALWAYS** use separate keys for dev/staging/production

### Best Practices
- Keep `.env` files in `.gitignore`
- Use hosting platform's environment variable management
- Log only first 6 characters of keys for debugging
- Monitor key usage through audit logs
- Have rollback plan for key rotation

---

## Migration Guide

See detailed migration guides:
- `SUPABASE_API_KEY_MIGRATION.md` - Complete migration walkthrough
- `docs/SUPABASE_SECRET_KEYS_SETUP.md` - Step-by-step setup instructions

---

## License

Copyright © 2024 Stripe Guardian. All rights reserved.

---

## Notes for Developers

### Version Numbering
- **Major version (X.0.0)**: Breaking changes, major new features
- **Minor version (0.X.0)**: New features, no breaking changes
- **Patch version (0.0.X)**: Bug fixes, small improvements

### Categories for Changes
- **Added**: New features
- **Changed**: Changes to existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security improvements

### Testing Checklist
- [ ] Test webhook handling with new keys
- [ ] Verify subscription creation/cancellation
- [ ] Check payment sheet functionality
- [ ] Test health check endpoints
- [ ] Monitor logs for key usage
- [ ] Verify both database connections work

