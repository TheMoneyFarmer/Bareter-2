#!/bin/bash
set -e
npm install
# `--force` keeps drizzle-kit non-interactive (post-merge has stdin closed).
# It only auto-confirms destructive prompts though — rename ambiguity prompts
# are NOT covered. The connect-pg-simple `session` table is declared in
# `shared/schema.ts` (as `sessionTable`) so drizzle never sees it as an
# orphan and never asks "is new_table a rename of session?". Keep both
# the `--force` flag and the `sessionTable` declaration in sync.
npm run db:push -- --force

echo "==> Running upload-auth security check"
npx tsx scripts/test-upload-auth.ts

echo "==> Running security regression suite (npm run test:security)"
if ! npm run test:security; then
  echo ""
  echo "!!! SECURITY TESTS FAILED — merge gate blocking."
  echo "!!! Fix the failures above (tests/security.test.ts) before merging."
  exit 1
fi
echo "==> Security regression suite passed."
