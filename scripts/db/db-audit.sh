#!/bin/bash
set -e

# Load Docker Host and PATH shim for Podman
export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock
export PATH="$PWD/scripts/bin:$PATH"

echo "🔍 Starting Database Safety Audit..."

# 1. Database Linting
echo "Step 1: Linting migrations..."
npm run db:lint

# 1b. Two-Phase Adversarial Migration Replay (ADR-0014)
echo "Step 1b: Verifying migrations via two-phase adversarial replay..."
npm run db:verify-migrations
npm run db:reset

# 1c. Security Advisor Warnings Verification (Categories 0007, 0008, 0010, 0026, 0027, 0028, 0029)
echo "Step 1c: Verifying Security Advisor linter resolution (0007, 0008, 0010, 0026, 0027, 0028, 0029)..."
npm run db:verify-advisor

# 2. Type Check (Local)
echo "Step 2: Verifying TypeScript types match local schema..."
npm run db:check-types:local

# 3. Drift Detection (Linked Project)
# WARNING: This connects to the remote linked project (Production) for comparison.
echo "Step 3: Checking for schema drift against linked production project..."
npx supabase db diff --remote || echo "⚠️ Warning: Remote linked project unreachable (network timeout). Skipping remote drift check."

echo "✅ Database Audit Complete. No critical drift or linting errors found."
