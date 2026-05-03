# Launch-Day Backup & Restore Checklist

Owner: Founder. Run once before public launch, then weekly thereafter.

The platform stores accounts, listings, deals, and signed contracts in a
Replit-managed PostgreSQL (Neon-backed) attached to the deployed App.
Day-one data loss would be unrecoverable, so this checklist exists to make
sure the safety net is real *before* we open the doors.

Background and the canonical "Backups & Restore" notes live in
[`../replit.md`](../replit.md).

---

## 1. One-time pre-launch verification

- [ ] **Confirm the plan's recovery window.** Open *Account → Billing*. The
      Replit plan determines the production-DB recovery window (7 days on
      Core, 28 days on Pro). Note the value here for the launch record:
      `recovery window = ____ days`, `plan = ____`.
- [ ] **Confirm production DB is attached to the deployment.** Open
      *Deployments → [Bareter] → Database*. The page must show a managed
      PostgreSQL with a non-empty connection string and a recent
      "last write" timestamp.
- [ ] **Perform a real test restore.** Pick any timestamp inside the recovery
      window. In *Deployments → Database*, choose **Point-in-time restore**,
      pick the timestamp, and confirm. Save a screenshot of the success
      message into `docs/launch-evidence/` (filename:
      `pitr-test-YYYYMMDD.png`).
- [ ] **Verify the restore landed.** Connect to the production DB read-only
      (e.g. via the Database pane's SQL console) and run:
      ```sql
      SELECT now() AS server_now,
             (SELECT MAX(created_at) FROM users)    AS last_user,
             (SELECT MAX(created_at) FROM listings) AS last_listing;
      ```
      Confirm the values reflect the chosen point in time. Paste the output
      into the launch record next to the screenshot.
- [ ] **Recover forward.** Once the test is captured, perform a second PITR
      back to the most recent timestamp so production is current again.
      Re-run the SQL above to confirm.
- [ ] **Document who can do this.** Make sure at least two human operators
      have permission to open *Deployments → Database* and trigger a restore.
      Names: `____________________`, `____________________`.

## 2. Recurring weekly spot-check (founder)

Set a recurring weekly reminder in your calendar titled
**"Bareter: weekly DB-backup spot-check"** linking to this file.

Each week, verify in under 2 minutes:

- [ ] *Deployments → Database* opens without error and shows a recent
      "last write" timestamp.
- [ ] The recovery window value still matches the plan (7 / 28 days).
- [ ] No alerts in the Replit notifications tray about the production DB.

If any of those fail, treat it as a P1 and fix before the next code change.

## 3. Incident playbook (only if production data is corrupted or lost)

1. **Stop writes immediately.** Take the App offline (Deployments → pause)
   so the corruption can't propagate further inside the recovery window.
2. **Pick a safe target timestamp.** The most recent timestamp *before* the
   first known bad write. Use logs, support reports, and the
   `audit_logs` table to triangulate.
3. **Restore.** *Deployments → Database → Point-in-time restore →* chosen
   timestamp. Wait for the success confirmation.
4. **Match the application code if needed.** If the corruption was caused by
   a bad deploy, also use *Checkpoints → Rollback* on the App to a
   pre-incident commit, then *Republish*.
5. **Sanity-check production.** Run the SQL block from section 1 plus a
   quick login + create-listing smoke test on the live domain.
6. **Resume traffic.** Un-pause the deployment.
7. **Post-mortem.** File a follow-up task documenting what happened, the
   restore window used, and what guard would prevent a repeat.
