---
name: Invite / waitlist registration gating
description: How invite codes let friends bypass the waitlist redirect, and the casing constraint that makes a valid code fail.
---

# Invite / waitlist registration gating

- Waitlist mode is ON only when env `WAITLIST_MODE=true` AND app_setting `waitlist_enabled != "false"` (see `/api/waitlist/mode`). When ON, the register page bounces unauthenticated visitors to `/` + opens the waitlist dialog.
- An invite link (`/register?invite=CODE`, generated from the admin beta-invite section) must skip that redirect so friends reach the registration form. The register page also treats `?ref=CODE` (waitlist referral link) as an invite code.
- **Casing constraint:** both `beta_invite_code` (app_setting) and waitlist `referralCode`s are generated/stored UPPERCASE, and the server matches them case-sensitively (`inviteCode === betaCode`, exact-case DB lookup). Any client-side invite-code handling must `trim().toUpperCase().slice(0,16)` or a lowercased link is wrongly rejected on submit.
  - **Why:** a lowercased or padded URL code silently fails the invite-only check even though it is "correct".
- **Enforcement boundary:** the register-page redirect is only a UX gate. Real invite-only enforcement is server-side in `/api/auth/register` (gated by app_setting `invite_only_mode`, validated against waitlist email / beta code / referral code). The client bypass does NOT bypass backend access control.
