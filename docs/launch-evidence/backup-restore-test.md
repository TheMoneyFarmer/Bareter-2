# Production Database — Test Restore Evidence

**Status:** _PARTIALLY FILLED — founder must complete TODO fields before sign-off._

This file is the audit artifact for Task #151 (production DB backup &
restore plan). It is committed to the repo *empty* on purpose so reviewers
and future operators can see the exact fields that need to be filled in,
and so a missing fill-in is impossible to ignore.

The procedure to fill this in lives in
[`../LAUNCH_BACKUP_CHECKLIST.md`](../LAUNCH_BACKUP_CHECKLIST.md), section 1.

---

## 1. Plan & recovery window confirmation

| Field                    | Value                |
| ------------------------ | -------------------- |
| Date checked (YYYY-MM-DD)| `TODO: date you confirmed the plan on Replit Account → Billing`         |
| Replit plan              | `TODO: e.g. "Core" (7-day window) or "Pro" (28-day window)`             |
| Recovery window (days)   | `TODO: 7 (Core) or 28 (Pro) — read from Deployments → Database panel`  |
| Operator (name + email)  | `TODO: primary operator full name and email`                            |
| Backup operator (name)   | `TODO: second person who can trigger a restore (full name)`             |

## 2. Test point-in-time restore

| Field                            | Value          |
| -------------------------------- | -------------- |
| Restore performed (UTC timestamp)| `TODO: e.g. 2026-05-10T10:00Z — when you triggered the PITR` |
| Target restore point (UTC)       | `TODO: e.g. 2026-05-09T08:00Z — the point you restored back to` |
| Replit success confirmation seen | `[ ] yes`                                                        |
| Screenshot file (relative path)  | `screenshots/pitr-test-YYYYMMDD.png` — `TODO: capture and rename with actual date` |

## 3. Post-restore verification SQL

After the PITR landed, the operator ran:

```sql
SELECT now() AS server_now,
       (SELECT MAX(created_at) FROM users)    AS last_user,
       (SELECT MAX(created_at) FROM listings) AS last_listing;
```

Output (paste here):

```
server_now    | last_user           | last_listing
--------------+---------------------+---------------------
              |                     |
```

Operator confirms the values reflect the chosen restore point: `[ ] yes`.

## 4. Roll forward to current

| Field                              | Value          |
| ---------------------------------- | -------------- |
| Forward PITR performed (UTC)       | `TODO: e.g. 2026-05-10T10:30Z — when you restored back to current` |
| Sanity SQL re-run and matches now  | `[ ] yes`                                                           |

## 5. Weekly spot-check reminder created

| Field                              | Value                |
| ---------------------------------- | -------------------- |
| Reminder title                     | `Bareter: weekly DB-backup spot-check` |
| Calendar host (Google / iCal / …)  | `TODO: e.g. Google Calendar / Apple Calendar / Outlook` |
| Cadence                            | weekly                                                  |
| Time of day & timezone             | `TODO: e.g. 09:00 GST (UTC+4) every Monday`             |
| Owner (name)                       | `TODO: your full name`                                  |
| Created on (YYYY-MM-DD)            | `TODO: date you created the recurring event`            |
| Screenshot of created event        | `screenshots/calendar-reminder-YYYYMMDD.png` — `TODO: capture and rename with actual date` |

---

## Sign-off

By filling in the fields above and committing this file, the operator
confirms that:

- A real point-in-time restore was successfully performed against the
  production database.
- The recurring weekly spot-check reminder exists in their calendar.

Operator signature (name): `TODO: your full name`
Date: `TODO: YYYY-MM-DD`
