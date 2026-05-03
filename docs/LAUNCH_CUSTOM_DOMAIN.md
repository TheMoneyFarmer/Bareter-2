# Custom domain — launch checklist

This is the founder-run checklist for Task #154: attaching `bareter.com`
(and `www.bareter.com`) to the production Replit Deployment with a
Replit-issued, auto-renewed TLS certificate, so the launch URL is the
brand domain instead of `*.replit.app`.

The audit artifact for this task is
[`launch-evidence/custom-domain.md`](launch-evidence/custom-domain.md).
Fill it in and commit it — that file is what proves the work was actually
done end-to-end.

> **Out of scope here:** the email DNS records (SPF / DKIM / DMARC / MX)
> live on the same domain but are owned by Task #152 — see
> [`LAUNCH_EMAIL_DELIVERABILITY.md`](LAUNCH_EMAIL_DELIVERABILITY.md).
> Don't touch any record name that starts with `resend`, `_dmarc`, or
> `send.` while doing this task; if a record already exists with the same
> name *don't replace it* — only add what's missing.

---

## 1. One-time pre-launch setup (founder)

- [ ] **Make sure the production deployment exists.** Replit workspace →
      *Publishing* → at least one successful deploy on the
      `*.replit.app` host. Custom domains can only be attached to a
      published deployment.
- [ ] **Add the apex domain.** *Publishing → Settings → Custom domains →
      Add custom domain* → `bareter.com`. Replit shows the DNS records
      you must add at the registrar (typically: an `A` / `AAAA` for the
      apex, sometimes a `TXT` for ownership verification).
- [ ] **Add the `www` subdomain.** Repeat the *Add custom domain* flow
      with `www.bareter.com`. Replit shows a `CNAME` (usually
      `www → <deployment>.replit.app` or the canonical Replit edge host).
- [ ] **Copy the records exactly as Replit shows them.** Source on
      what Replit expects:
      <https://docs.replit.com/cloud-services/deployments/custom-domains>.
      Treat the values in that dashboard as the source of truth — they
      can change as Replit migrates edge infrastructure.
- [ ] **Add the records at the registrar.** If `bareter.com` was bought
      through Replit, edit them via *Publishing → Domains → Edit → Add
      DNS Record*. Otherwise add them at the external registrar's DNS
      panel. Leave any existing email records (`resend*._domainkey`,
      `_dmarc`, `send.bareter.com` MX, the SPF `TXT` on the apex)
      **untouched**.
- [ ] **Wait for verification + TLS.** Replit's *Custom domains* page
      will move both `bareter.com` and `www.bareter.com` to a *Verified*
      / *Active* state and provision a Let's Encrypt-style certificate
      automatically. DNS propagation is usually minutes but can take up
      to 48 h.
- [ ] **Confirm green padlock from a clean browser.** Open a fresh
      incognito window (no cached cert):
      - `https://bareter.com` → loads the production app, padlock is
        green, certificate issuer is a trusted public CA, certificate
        SAN covers both `bareter.com` and `www.bareter.com`.
      - `https://www.bareter.com` → same.
      - `http://bareter.com` → 301 redirects to `https://bareter.com`.
      - `http://www.bareter.com` → 301 redirects to `https://www.bareter.com`
        (or to the apex — either is acceptable as long as it ends on
        HTTPS).
- [ ] **Spot-check certificate auto-renewal info.** Replit auto-renews
      Let's Encrypt-issued certs ~30 days before expiry; record the
      issuance date and expiry date from the browser cert viewer in the
      evidence file so a future operator can sanity-check that
      auto-renewal actually happened.
- [ ] **Hand off to downstream tasks.** Once both hosts are green:
      - Task #155 sets `PUBLIC_APP_URL=https://bareter.com` so outbound
        links (welcome emails, referral share link) point at the brand
        domain. Don't set this secret yourself — that's the next task in
        the queue.
      - Task #156 updates the Didit webhook URL to
        `https://bareter.com/api/didit/webhook`.
      - Task #159 runs an end-to-end smoke test on the published domain.

## 2. Recurring quarterly spot-check (founder)

Set a recurring quarterly reminder titled
**"Bareter: quarterly custom-domain TLS spot-check"**. Each quarter
verify in under 2 minutes:

- [ ] Both `https://bareter.com` and `https://www.bareter.com` still
      load with a green padlock from a clean incognito window.
- [ ] Browser cert viewer shows an expiry date *more than 30 days* in
      the future. If it's within 30 days, Replit's auto-renewal hasn't
      fired — open the playbook below.
- [ ] *Publishing → Custom domains* in Replit shows both hosts as
      *Active* with no warning banners.

If any of those slips, open the playbook below.

## 3. Incident playbook — domain or TLS broken

1. **Padlock missing / "Not Secure" / cert expired.** Open Replit
   *Publishing → Custom domains*. If status is anything other than
   *Active*, click *Re-verify* — usually a registrar TTL renewal dropped
   one record. Re-add whatever Replit complains is missing.
2. **301 to HTTPS doesn't fire.** Replit terminates TLS at its edge and
   should HTTPS-upgrade automatically; if `http://bareter.com` is
   serving plaintext, the deployment health check is failing. Check
   *Publishing → Logs* and the deployment-logs tool.
3. **Cert SAN doesn't cover `www`.** You added the apex but skipped the
   `www` *Add custom domain* step. Add it now and wait for re-issuance.
4. **DNS shows old values.** Some registrars cache aggressively. Force
   a refresh with `dig +trace bareter.com` and `dig CNAME www.bareter.com`.
5. **Post-mortem.** Append a one-paragraph entry to
   [`launch-evidence/custom-domain.md`](launch-evidence/custom-domain.md)
   section 4: date, symptom, root cause, fix, prevention.

## 4. Rollback (worst case, day-of-launch)

If the custom domain is broken at announce-time and can't be fixed in <1 h:

1. Temporarily redirect the announcement traffic to the existing
   `*.replit.app` host (it always works while a deployment is live).
2. Leave `PUBLIC_APP_URL` *unset* in production so outbound links fall
   through to `REPLIT_DOMAINS` (the `*.replit.app` host) — see
   [`replit.md` → "Custom Domain & Outbound Links"](../replit.md).
3. Keep the *Custom domains* tab open, fix the DNS / verification issue,
   and re-set `PUBLIC_APP_URL` once the padlock is back.
