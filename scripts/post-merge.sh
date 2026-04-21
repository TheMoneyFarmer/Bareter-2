#!/bin/bash
set -e
npm install
npm run db:push
npx tsx scripts/test-upload-auth.ts
