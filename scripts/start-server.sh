#!/bin/sh
# Starts the App Runner container. Migrations run here because the database
# is private and GitHub-hosted runners cannot reach it. The shell composes
# DATABASE_URL the same way lib/prisma.ts does when App Runner injects the
# secret fields as separate variables.
set -eu
export HOSTNAME=0.0.0.0

if [ -z "${DATABASE_URL:-}" ] && [ -n "${DB_HOST:-}" ]; then
  DATABASE_URL="$(node -e 'const e=encodeURIComponent;process.stdout.write("postgresql://"+e(process.env.DB_USERNAME||"")+":"+e(process.env.DB_PASSWORD||"")+"@"+process.env.DB_HOST+":"+process.env.DB_PORT+"/"+process.env.DB_NAME+"?schema=public&sslmode=require")')"
  export DATABASE_URL
fi

if [ -n "${DATABASE_URL:-}" ]; then
  node node_modules/prisma/build/index.js migrate deploy
fi

exec node server.js
