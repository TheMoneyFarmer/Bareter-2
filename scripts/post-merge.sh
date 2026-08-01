#!/bin/bash
set -e

# ── SAFETY GATE: Block db:push from ever running in this script ───────────────
# This scans the script itself for any uncommented db:push or drizzle-kit push
# call. If found, the deploy is aborted immediately. Do NOT remove this check.
SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
UNSAFE_LINES=$(grep -E "^\s*(npm run db:push|npx drizzle-kit push|drizzle-kit push)" "$SCRIPT_PATH" | grep -v "^#" || true)
if [ -n "$UNSAFE_LINES" ]; then
  echo ""
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo "!!! FATAL: db:push detected in post-merge.sh          !!!"
  echo "!!! This command has caused production data loss.      !!!"
  echo "!!! Deploy ABORTED. Remove db:push from this script.  !!!"
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo ""
  exit 1
fi

# ── SAFETY GATE: Block db:push in any production environment ─────────────────
if [ -n "$REPL_ID" ] || [ "$NODE_ENV" = "production" ]; then
  # Double-check: refuse to run drizzle push in any form
  alias drizzle-kit='echo "BLOCKED: drizzle-kit is disabled in production" && exit 1' 2>/dev/null || true
fi

npm install
# NEVER run db:push --force in production — it can drop tables and wipe live data.
# Schema migrations must be reviewed manually and run with explicit intent.
# npm run db:push -- --force   <-- THIS LINE CAUSED DATA LOSS. DO NOT RESTORE IT.
npm run build

echo "==> Running security regression suite (npm run test:security)"
if ! npm run test:security; then
  echo ""
  echo "!!! SECURITY TESTS FAILED — merge gate blocking."
  echo "!!! Fix the failures above (tests/security.test.ts) before merging."
  exit 1
fi
echo "==> Security regression suite passed."
