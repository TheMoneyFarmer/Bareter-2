# Memory Index

- [Invite / waitlist registration gating](invite-code-gating.md) — invite codes are UPPERCASE-normalized and matched case-sensitively; client redirect is UX-only, server is the real enforcement boundary.
- [Auth session / stale-login UX](auth-session-stale-login.md) — global staleTime:Infinity means a dead session never re-checks; reactively clear auth cache on 401 and verify session right after login (in-app browsers block cookies).
- [npm devDeps & lock/override sync](npm-deps-prod-and-lock-sync.md) — NODE_ENV=production omits devDeps on install; adding overrides needs the lockfile regenerated or deploy npm ci fails; scope overrides to dodge EOVERRIDE; runtime-generated cred dirs (whatsapp-auth/) must stay gitignored.
- [Email broadcast personalization](email-broadcast-personalization.md) — admin broadcast has two parallel send paths (test + real); keep both in sync; names only substitute when HTML uses {{firstName}}, else "Hi there,".
- [VM uptime & background tasks](vm-uptime-background-tasks.md) — keep global crash guards in index.ts; gate WhatsApp to REPLIT_DEPLOYMENT only (dev+prod sharing one WA session = code 440 loop → crashes → short outages).
- [Email CTA warm-up redirect](email-cta-warmup-redirect.md) — injectSmartCtaUrls must emit ONE /?src=email&to=<realpath> wrapper; nested wrappers strand users on hero (landing redirect effect runs once on mount).
