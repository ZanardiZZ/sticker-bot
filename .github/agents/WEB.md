# Web Guide

Use this guide when changing the admin panel, Express routes, auth, or web-side data access.

## Main Files

- [src/web/server.js](/home/dev/work/sticker-bot2/src/web/server.js)
- [src/web/auth.js](/home/dev/work/sticker-bot2/src/web/auth.js)
- [src/web/dataAccess.js](/home/dev/work/sticker-bot2/src/web/dataAccess.js)
- [src/web/routes/](/home/dev/work/sticker-bot2/src/web/routes)
- [src/web/public/](/home/dev/work/sticker-bot2/src/web/public)

## Current Expectations

- Keep route registration and auth middleware order intact.
- Avoid introducing startup-time crashes from renamed db init functions or route modules.
- Preserve session and admin boot behavior.
- Keep responses and data access consistent with existing tests and calling code.

## Validation

- `npm run smoke`
- `npm run check`
- `npm run test:integration` for route or persistence changes

## Common Risks

- route modules referencing wrong exports
- startup failures in `src/web/server.js`
- auth regressions from middleware ordering
- silent schema drift between route handlers and `src/web/dataAccess.js`
