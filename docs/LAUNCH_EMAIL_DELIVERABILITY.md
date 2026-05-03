# Email deliverability — launch checklist

This is the founder-run checklist for Task #152: getting Bareter's
transactional sending domain verified inside Resend with valid SPF, DKIM,
and DMARC, so welcome emails / password resets / contract notifications /
campaign sends actually land in the inbox.

The audit artifact for this task is
[`launch-evidence/email-deliverability.md`](launch-evidence/email-deliverability.md).
Fill it in and commit it — that file is what proves this work was actually
done end-to-end.

---

## 1. One-time pre-launch verification (founder)

- [ ] **Pick the sending identity.** Use `hello@bareter.com` for human-facing
      mail (welcome, password reset, contract, campaign) and keep
      `noreply@bareter.com` available as the bounce/no-reply alias. Both
      live on the apex `bareter.com` domain — same DNS records cover both.
- [ ] **Add the domain in Resend.** Resend dashboard → *Domains* → *Add
      Domain* → `bareter.com`. Region: closest to the deployment.
- [ ] **Copy the DNS records Resend shows.** There will be:
      - 1 × `TXT` (SPF) — `v=spf1 include:amazonses.com ~all` (Resend uses
        SES under the hood; the exact `include:` Resend prints is the
        source of truth — paste theirs, not this).
      - 2–3 × `CNAME` (DKIM) — names look like `resend._domainkey`,
        `resend2._domainkey`, etc.
      - 1 × `MX` (return-path / bounces) on a `send.bareter.com`
        sub-host so bounces don't pollute the apex.
- [ ] **Add a DMARC record.** Separately add a `TXT` at `_dmarc.bareter.com`
      with at minimum:
      `v=DMARC1; p=quarantine; rua=mailto:dmarc@bareter.com; pct=100; adkim=s; aspf=s`
      Start at `p=quarantine` for the first week, then move to `p=reject`
      once Resend reports zero alignment failures.
- [ ] **Add the records at the registrar.** If `bareter.com` was bought
      through Replit, add them via *Publishing → Domains → Edit → Add DNS
      Record*. Otherwise add them at the external registrar's DNS panel.
      Source on Replit-managed DNS:
      <https://docs.replit.com/cloud-services/deployments/custom-domains>.
- [ ] **Wait for verification.** Resend's *Domains* page must show all
      records green (SPF ✓, DKIM ✓, DMARC ✓). DNS propagation is usually
      minutes but can take up to 48 h.
- [ ] **Flip `RESEND_FROM_EMAIL`.** Once the domain is green, set the
      `RESEND_FROM_EMAIL` secret to `hello@bareter.com` (production
      Deployment + this workspace). The app's `FALLBACK_FROM` is already
      `noreply@bareter.com` so we are never sending from a non-`bareter.com`
      address.
- [ ] **Send three deliverability tests.** From the workspace shell:
      ```
      RESEND_TEST_TO=you+gmail@gmail.com  npx tsx scripts/resend-send-test.mjs
      RESEND_TEST_TO=you@outlook.com      npx tsx scripts/resend-send-test.mjs
      RESEND_TEST_TO=you@icloud.com       npx tsx scripts/resend-send-test.mjs
      ```
      All three must land in **Inbox**, not Spam / Promotions / Junk.
- [ ] **Capture evidence.** Save a screenshot of each inbox into
      `docs/launch-evidence/screenshots/email-{gmail,outlook,icloud}-YYYYMMDD.png`,
      then fill in
      [`launch-evidence/email-deliverability.md`](launch-evidence/email-deliverability.md)
      (sections 1–4) with timestamps, message IDs, and the green-check
      Resend screenshot.

## 2. Recurring monthly spot-check (founder)

Set a recurring monthly reminder titled
**"Bareter: monthly Resend domain spot-check"**. Each month verify in
under 2 minutes:

- [ ] Resend → *Domains* → `bareter.com` still shows SPF / DKIM / DMARC
      all green.
- [ ] Resend → *Insights* shows >95 % delivered and <2 % bounced over the
      last 30 days.
- [ ] DMARC aggregate report (sent to `rua` mailbox) shows 100 %
      alignment.

If any of those slips, open the playbook below.

## 3. Incident playbook — emails landing in spam

1. Check Resend → *Insights* → bounce / complaint rate. >5 % bounces or
   >0.1 % complaints means we're being throttled by mailbox providers.
2. Re-verify all DNS records exist and Resend still shows them green.
   A registrar TTL renewal sometimes drops one CNAME.
3. Inspect the offending email's *Original / Show Original* in Gmail. SPF
   must say `pass` and DKIM must say `pass` with `d=bareter.com`.
4. If DMARC is failing alignment (`adkim=s` / `aspf=s` strict), double-check
   the `from:` is `@bareter.com` and not a sub-domain.
5. Drop send volume to a trickle for 24 h, then ramp back up.
6. Post-mortem: append a one-paragraph entry to
   `docs/launch-evidence/email-deliverability.md` section 5.
