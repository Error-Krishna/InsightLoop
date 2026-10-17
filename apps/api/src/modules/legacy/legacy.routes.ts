import { Router } from 'express';

/**
 * Legacy router:
 * Audit of Django urls.py vs public_urls.py confirmed Django is strictly API-only now.
 * Non-API routes served by Django:
 * - GET / (root_redirect -> FRONTEND_ORIGIN or JSON) - ported in app.ts
 * - POST/GET /contact (contact_view) - ported in contact.routes.ts
 * - GET /media/* (static media serve) - ported in app.ts
 *
 * No uncataloged legacy HTML routes (/login, /dashboard, etc.) are served by Django today.
 * Therefore no invented legacy shadow routes are intercepted here; undefined paths
 * fall through to the standard 404 handler.
 */
export const legacyRouter = Router();
