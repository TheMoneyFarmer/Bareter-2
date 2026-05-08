# Sanity Studio — Content Editor Access

This document explains how to invite content editors so they can log in to
**bareter.sanity.studio** with their own Sanity accounts instead of sharing
the founder's credentials.

---

## Roles overview

| Role | What they can do |
|---|---|
| **Administrator** | Full project access, manage members, API tokens, webhooks |
| **Editor** | Create, edit, and publish content — cannot touch project settings |
| **Viewer** | Read-only access to content — cannot publish |

Content editors should be assigned the **Editor** role.

---

## Inviting an editor (step-by-step)

1. Log in to [sanity.io/manage](https://sanity.io/manage) with the founder account.
2. Open the **Bareter** project (`ho605hmx`) or navigate directly to  
   [sanity.io/manage/project/ho605hmx](https://sanity.io/manage/project/ho605hmx).
3. Click **Members** in the left sidebar.
4. Click **Invite members**.
5. Enter the editor's email address.
6. Set the role to **Editor**.
7. Click **Send invite**.

The editor receives an email from Sanity. They click the link, create (or log
into) a free Sanity account, and then have immediate access to the Studio.

---

## Editor login flow (for the editor)

1. Accept the invitation email from Sanity.
2. Create a free account at [sanity.io](https://sanity.io) if they don't have one.
3. Go to [bareter.sanity.studio](https://bareter.sanity.studio).
4. Click **Sign in** — use the same email/provider they registered with.
5. They land directly in the Studio with editor permissions.

Editors **do not need** any Replit access, API tokens, or founder credentials.

---

## Revoking access

1. Go to [sanity.io/manage/project/ho605hmx](https://sanity.io/manage/project/ho605hmx) → **Members**.
2. Find the member and click the kebab menu (⋮) beside their name.
3. Select **Remove from project**.

Access is revoked immediately — the next Studio page load will prompt them to
request access again.

---

## Changing a member's role

1. Go to **Members** in the project management dashboard.
2. Click the role badge next to the member's name.
3. Select the new role from the dropdown and confirm.

---

## Notes

- Sanity accounts are free; editors pay nothing to sign up.
- The Studio URL (`bareter.sanity.studio`) is public, but unauthenticated users
  only see a login prompt — no content is exposed without a valid project membership.
- Webhook and API token settings are only visible to Administrators, so editors
  cannot accidentally alter the integration with the Bareter backend.
