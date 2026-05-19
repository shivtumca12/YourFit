#!/bin/bash
cd "$(dirname "$0")"

NODE=""
for candidate in \
  "$(command -v node 2>/dev/null)" \
  "/opt/homebrew/bin/node" \
  "/usr/local/bin/node" \
  "/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node"; do
  if [ -x "$candidate" ]; then
    NODE="$candidate"
    break
  fi
done

if [ -z "$NODE" ]; then
  echo "Node.js not found. Install from https://nodejs.org then run: npm install && npm start"
  exit 1
fi

echo "Using: $NODE"
echo "Database: data/yourfit.db (SQLite)"
exec "$NODE" server/standalone.js
