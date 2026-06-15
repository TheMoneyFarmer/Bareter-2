---
name: Email broadcast personalization
description: The admin email broadcast has two parallel send paths that must stay in sync; placeholder substitution drives per-recipient names.
---

# Email broadcast personalization

The admin email broadcast feature has TWO separate send paths in `server/routes.ts`:
the **test send** (`POST /api/admin/email/test`) and the **real broadcast**
(`POST /api/admin/email/broadcast`). Each builds its own per-recipient template
`vars` and calls `sendAdminEmail`.

**Rule:** When changing personalization (greeting, name resolution, fallback),
update BOTH paths. They are not shared code.

**Why:** A past bug had the test send using a hardcoded sample name while the real
broadcast already personalized correctly — so a test-to-self showed a fake name and
looked broken even though real sends were fine. Fixing only one path leaves the
other wrong.

**How to apply:**
- Personalization works only when the pasted/template HTML uses placeholders
  (e.g. `{{firstName}}`, `{{name}}`, `{{email}}`). A literally-typed name in the
  HTML body is never substituted. `applyTemplateVars` (server/emailService.ts)
  does a global `{{key}}` -> value replace; `renderBroadcastEmailHtml` runs it even
  on raw/pasted HTML.
- Name fallback convention: missing name -> `firstName = "there"` and greeting
  `"Hi there,"`. Recipient name sources mirror the broadcast audiences: registered
  users, `waitlistEntries.name`, `internationalWaitlist.fullName`; feature
  waitlists store email only (no name).
