#!/bin/bash

# scripts/simulate-ci.sh
# Simulates the GitHub CI PWA Production Audit environment locally.

echo "--- Simulating CI Environment (Production Build) ---"

# 1. Load NVM if available
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# 2. Build the application
echo "Building application..."
npm run build

# 3. Start the production server in the background
echo "Starting production server on port 3001..."
IS_E2E=true npm run start -- -p 3001 &
SERVER_PID=$!

# 4. Wait for server to be ready
echo "Waiting for server to start..."
until curl -s http://localhost:3001 > /dev/null; do
  sleep 1
done

# 5. Run Playwright tests
echo "Running E2E tests (PWA Audit project)..."
npx playwright test e2e/pwa-assets.spec.ts e2e/pwa-offline.spec.ts e2e/pwa-install-layout.spec.ts e2e/smoke.spec.ts e2e/trip-flow.spec.ts --project=chromium

# 6. Cleanup
echo "Cleaning up..."
kill $SERVER_PID
echo "Done."
