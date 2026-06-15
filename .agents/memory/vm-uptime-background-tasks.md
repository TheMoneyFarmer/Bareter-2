---
name: VM uptime & background tasks
description: Why the VM deployment suffered repeated short outages, and the two invariants that keep bareter.com up.
---

# VM uptime & in-process background tasks

The app deploys as a **VM** (always-on) and runs background subsystems in the
same process as the Express web server: the Baileys WhatsApp socket, node-cron
schedulers, and AI agents.

## Invariant 1: global crash guards are mandatory
`server/index.ts` must register `process.on("unhandledRejection")` and
`process.on("uncaughtException")` handlers that log and KEEP the process alive.

**Why:** background tasks attach `.catch()` only to their *startup* promise.
Errors thrown later inside timers/event handlers (Baileys especially) are
otherwise unhandled and terminate the whole Node process → VM restart → a short
site outage. A burst of these produced ~27 short outages in a day. The website
must never go down because a background subsystem threw.
**How to apply:** never remove these handlers; if adding new long-running
in-process subsystems, assume they will throw asynchronously.

## Invariant 2: WhatsApp runs in PRODUCTION ONLY
Gate the Baileys `whatsappService.start()` on `process.env.REPLIT_DEPLOYMENT`
(set only in the published deployment), NOT on `REPL_ID` (set in the dev
workspace too).

**Why:** WhatsApp allows a single live session per number, and dev + prod both
restore the same session from Object Storage. If both run it they fight over the
session and each kicks the other off — disconnect **code 440** — in an endless
~10s reconnect loop (the telltale sign: `consecutiveDrops` keeps resetting to 1
because it briefly reaches "open" then drops). That churn raises the odds of an
unhandled crash.
**How to apply:** code 440 = session conflict (someone else is on that session),
not a transient network drop. A brief 440 burst is also expected during a
redeploy while the old and new containers overlap; the crash guard covers it.
Fixes only take effect in production after a republish.
