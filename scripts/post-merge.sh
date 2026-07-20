#!/bin/bash
set -e
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
