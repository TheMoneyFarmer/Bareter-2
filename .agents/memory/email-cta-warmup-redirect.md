---
name: Email CTA warm-up redirect
description: How email links land on the hero then redirect, and the single-wrap invariant that keeps it from stranding users.
---

# Email CTA "warm-up" redirect

Marketing/broadcast email links are meant to open the hero/landing page first
(`/?src=email&to=<path>`) and then silently redirect to the intended page after
~5s. Two cooperating pieces:

- **Server**: `injectSmartCtaUrls` (server/emailService.ts) rewrites internal
  links in broadcast HTML into the warm-up shape. The real broadcast and the
  test-send route both call it — fix the function, both paths are fixed.
- **Client**: the landing page reads `?src=email` + `to=` and `setTimeout(navigate(to), 5000)`.

## Invariant: emit EXACTLY ONE warm-up wrapper per link
The wrapper must be `/?src=email&to=<realpath>` where `<realpath>` is a normal
app path (e.g. `/register`), never another warm-up URL.

**Why:** the landing redirect effect runs **once on mount** (`[]` deps). If the
`to=` value is itself a nested warm-up URL (`to=/?src=email&to=/register`), the
first redirect navigates to `/` again — wouter keeps the Landing component
mounted because the route is still `/`, so the effect never re-runs and the
visitor is stranded on the hero. This was the actual cause of "email link just
loads the hero, never redirects." Always strip any pre-existing wrapper before
re-wrapping so links can't be double/triple-wrapped.

**How to apply:**
- Never produce `to=/` or `to=/?src=email` (would loop back to the hero) —
  fall back to inferring a real path from the button text, default `/register`.
- Bare-domain links (`https://bareter.com` with no path) must also be inferred
  from button text, or they get no `src=email` and never redirect.
- Leave external links alone (other domains, `mailto:`, `tel:`) so unsubscribe /
  social links keep working.
- Transactional emails with token URLs (verify-email, reset-password) must link
  DIRECTLY and must NOT go through the warm-up wrapper.
