# Production Database — Test Restore Evidence

**Status:** _UNFILLED — must be completed by the founder before public launch._

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
| Date checked (YYYY-MM-DD)| `____________`       |
| Replit plan              | `____________`       |
| Recovery window (days)   | `____________`       |
| Operator (name + email)  | `____________`       |
| Backup operator (name)   | `____________`       |

## 2. Test point-in-time restore

| Field                            | Value          |
| -------------------------------- | -------------- |
| Restore performed (UTC timestamp)| `____________` |
| Target restore point (UTC)       | `____________` |
| Replit success confirmation seen | `[ ] yes`      |
| Screenshot file (relative path)  | `screenshots/pitr-test-YYYYMMDD.png` |

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
| Forward PITR performed (UTC)       | `____________` |
| Sanity SQL re-run and matches now  | `[ ] yes`      |

## 5. Weekly spot-check reminder created

| Field                              | Value                |
| ---------------------------------- | -------------------- |
| Reminder title                     | `Bareter: weekly DB-backup spot-check` |
| Calendar host (Google / iCal / …)  | `____________`       |
| Cadence                            | weekly               |
| Time of day & timezone             | `____________`       |
| Owner (name)                       | `____________`       |
| Created on (YYYY-MM-DD)            | `____________`       |
| Screenshot of created event        | `screenshots/calendar-reminder-YYYYMMDD.png` |

---

## Sign-off

By filling in the fields above and committing this file, the operator
confirms that:

- A real point-in-time restore was successfully performed against the
  production database.
- The recurring weekly spot-check reminder exists in their calendar.

Operator signature (name): `____________`
Date: `____________`
