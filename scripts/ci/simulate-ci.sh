#!/bin/bash
set -e

# Load NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

echo "🚀 Simulating GitHub CI environment..."

# 1. Environment Variables (Critical for Store Hydration)
export IS_E2E=true
export NEXT_PUBLIC_IS_E2E=true
export CI=true
export NODE_ENV=production

# Load secrets from .env.local if present
if [ -f .env.local ]; then
  echo "📄 Loading secrets from .env.local..."
  export $(grep -v '^#' .env.local | xargs)
fi

echo "🏗️ Step 1: Building app (Building Once)..."
npm run build

echo "📡 Step 2: Starting production server in background..."
# Start server on 3001
npm run start -- -p 3001 &
SERVER_PID=$!

# Wait for server to be ready
echo "⏳ Waiting for server to start..."
until curl -s http://localhost:3001 > /dev/null; do
  sleep 1
done
echo "✅ Server is UP (PID: $SERVER_PID)"

echo "🧪 Step 3: Running Playwright Shard 1 of 4 (Chromium)..."
# We run with the existing server we just started.
npx playwright test --shard=1/4 --project=chromium --grep-invert "pwa-"

echo "🧹 Step 4: Cleaning up..."
kill $SERVER_PID
echo "✅ CI Simulation Complete!"
