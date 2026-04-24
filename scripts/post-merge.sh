#!/bin/bash
set -e
npm install
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
