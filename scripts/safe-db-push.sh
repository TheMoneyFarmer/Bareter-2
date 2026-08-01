#!/bin/bash
# Safe wrapper around drizzle-kit push.
# Blocks execution in any production or Replit environment.
# Usage: npm run db:push (via package.json)

# Block if running inside Replit
if [ -n "$REPL_ID" ] || [ -n "$REPLIT_DOMAINS" ] || [ -n "$REPL_IDENTITY" ]; then
  echo ""
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo "!!! BLOCKED: db:push cannot run in a Replit environment !!!"
  echo "!!! This command has caused production data loss before. !!!"
  echo "!!! Run schema migrations locally only.                 !!!"
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo ""
  exit 1
fi

# Block if NODE_ENV is production
if [ "$NODE_ENV" = "production" ]; then
  echo ""
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo "!!! BLOCKED: db:push cannot run in NODE_ENV=production !!!"
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo ""
  exit 1
fi

# Block --force flag under any circumstance
for arg in "$@"; do
  if [ "$arg" = "--force" ] || [ "$arg" = "-f" ]; then
    echo ""
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    echo "!!! BLOCKED: --force flag is permanently disabled.     !!!"
    echo "!!! This flag drops and recreates tables, wiping data. !!!"
    echo "!!! If you truly need a destructive migration, do it   !!!"
    echo "!!! manually via psql with a full backup first.        !!!"
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    echo ""
    exit 1
  fi
done

echo "==> db:push safety check passed (local environment, no --force)"
echo "==> Running: drizzle-kit push"
echo ""
npx drizzle-kit push "$@"
