# Memory Index

- [Invite / waitlist registration gating](invite-code-gating.md) — invite codes are UPPERCASE-normalized and matched case-sensitively; client redirect is UX-only, server is the real enforcement boundary.
- [Auth session / stale-login UX](auth-session-stale-login.md) — global staleTime:Infinity means a dead session never re-checks; reactively clear auth cache on 401 and verify session right after login (in-app browsers block cookies).
- [npm devDeps & lock/override sync](npm-deps-prod-and-lock-sync.md) — NODE_ENV=production omits devDeps on install; adding overrides needs the lockfile regenerated or deploy npm ci fails; scope overrides to dodge EOVERRIDE; runtime-generated cred dirs (whatsapp-auth/) must stay gitignored.
