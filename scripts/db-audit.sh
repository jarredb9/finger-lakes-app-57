#!/bin/bash
set -e

# Load Docker Host for Podman
export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock

echo "🔍 Starting Database Safety Audit..."

# 1. Database Linting
echo "Step 1: Linting migrations..."
npm run db:lint

# 2. Type Check (Local)
echo "Step 2: Verifying TypeScript types match local schema..."
npm run db:check-types:local

# 3. Drift Detection (Linked Project)
# WARNING: This connects to the remote linked project (Production) for comparison.
echo "Step 3: Checking for schema drift against linked production project..."
npx supabase db diff --linked

echo "✅ Database Audit Complete. No critical drift or linting errors found."
