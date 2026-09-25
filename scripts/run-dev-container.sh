#!/bin/bash

# scripts/run-dev-container.sh
# Purpose: Run Next.js dev server with native Turbopack inside container (Ubuntu 24.04 / glibc 2.39) on RHEL 8.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/container-common.sh"

# 1. Environment & Pre-flight
setup_container_engine

# Detect TTY environment
INTERACTIVE_FLAG="-t"
if [ -t 0 ]; then
    INTERACTIVE_FLAG="-it"
fi

# 2. Ensure image exists
ensure_container_image "$IMAGE"

# 3. Setup container execution and cleanup
CONTAINER_NAME="winery-dev-$(date +%s)"

cleanup() {
    echo ""
    echo "🛑 Stopping dev container ($CONTAINER_NAME)..."
    $ENGINE stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
    $ENGINE rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
    exit 0
}
trap cleanup SIGINT SIGTERM

sync

echo "🚀 Starting Next.js Dev Server (Turbopack) in container ($ENGINE)..."
echo "🌐 Local URL: http://localhost:3000"

$ENGINE run --rm $INTERACTIVE_FLAG \
    --name "$CONTAINER_NAME" \
    --network=host \
    --init \
    -v "$(pwd):/work:Z" \
    "${EXTRA_OPTS[@]}" \
    --security-opt label=disable \
    --security-opt seccomp=unconfined \
    -w /work \
    -e NODE_ENV="development" \
    -e NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-http://127.0.0.1:54321}" \
    -e NEXT_PUBLIC_IS_E2E="$NEXT_PUBLIC_IS_E2E" \
    -e E2E_REAL_DATA="$E2E_REAL_DATA" \
    "$IMAGE" \
    /bin/bash -c '
        set -e
        if [ ! -d "node_modules" ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
            echo "Installing dependencies..."
            npm install
        fi
        npm run dev "$@"
    ' bash "$@"
