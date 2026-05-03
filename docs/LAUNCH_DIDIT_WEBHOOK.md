# Didit webhook — launch checklist

This is the founder-run checklist for Task #156: pointing Didit's KYC
**and** KYB webhook URLs at the production custom domain so identity
verification actually flips users to `APPROVED` once they finish on the
published site.

The audit artifact for this task is
[`launch-evidence/didit-webhook.md`](launch-evidence/didit-webhook.md).
Fill it in and commit it — that file is what proves the webhook is
landing on the production server end-to-end.

> **Prerequisites:** Tasks #154 (custom domain + TLS) and #155
> (`PUBLIC_APP_URL` set) must already be green. If they aren't, do not
> change Didit yet — leave the webhook pointing at whatever host
> currently works.

---

## What the code expects

The webhook route is mounted in `server/routes.ts` at:

```
POST /api/webhooks/didit
```

(See `app.post("/api/webhooks/didit", diditWebhookHandler)`.)

So the production webhook URL — for **both** the KYC workflow and the
KYB workflow in Didit's dashboard — must be exactly:

```
https://bareter.com/api/webhooks/didit
```

Signature verification is HMAC-SHA256 over the raw request body, keyed
by the `DIDIT_WEBHOOK_SECRET` secret. The header carrying the signature
is `x-webhook-signature`. None of that changes for this task — the
secret is already set on the production deployment.

The handler resolves the user via `session_id`, then on `APPROVED`
flips `kyc_status` (or `kyb_status` for business accounts) to
`APPROVED`, sets `is_verified = true`, stamps `didit_verified_at`,
and creates a "Verification Complete" notification.

## 1. One-time pre-launch setup (founder)

- [ ] **Confirm prerequisites are green.** Custom domain (#154) shows
      green padlock; `PUBLIC_APP_URL=https://bareter.com` set in
      production (#155); production deployment is currently live.
- [ ] **Open Didit dashboard → Workflows → KYC workflow.** Update the
      *Webhook URL* to:
      ```
      https://bareter.com/api/webhooks/didit
      ```
      Save.
- [ ] **Open Didit dashboard → Workflows → KYB workflow.** Update the
      *Webhook URL* to the **same** URL above. Save.
      (Both workflows post to the same endpoint — the handler decides
      KYC vs KYB based on the user's `accountType`.)
- [ ] **Confirm the signing secret matches.** In Didit's *Webhook
      settings* the signing secret value must equal the
      `DIDIT_WEBHOOK_SECRET` set on the production deployment. If you
      ever rotate the secret in Didit, update the production secret
      and redeploy in the same change window.
- [ ] **Send a Didit-side test ping** (if Didit's dashboard offers a
      "Send test event" button on the webhook). Expect HTTP 200 with
      body `{"received":true}` from production.
- [ ] **Run a real verification on the published site.**
      1. From a clean browser, register a fresh test user on
         `https://bareter.com`.
      2. Start KYC verification, complete the Didit flow with a real
         document.
      3. Within ~60 seconds: the user's `kyc_status` row in production
         should be `APPROVED`, `is_verified` `true`, `didit_verified_at`
         populated, and a "Verification Complete" notification should
         exist for that user.
      4. Repeat with a business-type test account → expect
         `kyb_status = APPROVED` instead.
- [ ] **Capture evidence.** Fill in
      [`launch-evidence/didit-webhook.md`](launch-evidence/didit-webhook.md)
      with the configured URLs, the test-event response, and the SQL /
      admin-dashboard screenshots showing the `APPROVED` row for the
      KYC and KYB test users.

## 2. Recurring monthly spot-check (founder)

Set a recurring monthly reminder titled
**"Bareter: monthly Didit webhook spot-check"**. Each month verify in
under 2 minutes:

- [ ] Didit dashboard → both workflows still show the
      `https://bareter.com/api/webhooks/didit` URL.
- [ ] Production logs (last 30 days) contain at least one
      `Didit webhook received:` line per recently-verified user — i.e.
      no silent stoppage.
- [ ] No `Invalid Didit webhook signature` errors in the last 30 days.
      A spike means the signing secret has drifted between Didit and
      the production deployment.

If any of those slips, open the playbook below.

## 3. Incident playbook — verifications stuck at NOT_STARTED

1. **Did the webhook arrive at all?** Check the deployment logs for
   `Didit webhook received:` near the verification timestamp. If
   nothing arrived, the URL in Didit is wrong (check #1 first) or
   Didit retried and gave up.
2. **Signature failing?** Look for `Invalid Didit webhook signature`.
   Means the `DIDIT_WEBHOOK_SECRET` on production no longer matches
   what Didit is signing with — rotate one to match the other and
   redeploy.
3. **`User not found for session:`** in logs. The verification was
   created against a different environment (e.g. dev) and Didit
   posted to production. Re-run the verification cleanly from
   production.
4. **Status arrives but DB doesn't flip.** Inspect the payload in
   logs and the `users` row by `didit_session_id`. If the row exists
   but the update silently no-ops, escalate (this would be a code
   regression, not a config issue).
5. **Post-mortem.** Append a one-paragraph entry to
   [`launch-evidence/didit-webhook.md`](launch-evidence/didit-webhook.md)
   section 4: date, symptom, root cause, fix, prevention.
