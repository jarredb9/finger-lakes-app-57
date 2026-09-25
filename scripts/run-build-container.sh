#!/bin/bash

# scripts/run-build-container.sh
# Purpose: Run Next.js production build inside container (Ubuntu 24.04 / glibc 2.39) on RHEL 8 to bypass glibc < 2.29 SWC limitations.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/container-common.sh"

# 1. Environment & Pre-flight
setup_container_engine

# Detect TTY/CI environment to set interactive flags safely
INTERACTIVE_FLAG="-t"
if [ -t 0 ] && [ "$CI" != "true" ]; then
    INTERACTIVE_FLAG="-it"
fi

# 2. Ensure we have the image
ensure_container_image "$IMAGE"

# 3. Run container
CONTAINER_NAME="winery-build-$(date +%s)"
$ENGINE stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
$ENGINE rm "$CONTAINER_NAME" >/dev/null 2>&1 || true

# Flush filesystem to ensure volume mount sees latest changes
sync

echo "📦 Running Next.js build in container ($ENGINE)..."

$ENGINE run --rm $INTERACTIVE_FLAG \
    --name "$CONTAINER_NAME" \
    --network=host \
    -v "$(pwd):/work:Z" \
    "${EXTRA_OPTS[@]}" \
    --security-opt label=disable \
    --security-opt seccomp=unconfined \
    -w /work \
    -e CI="$CI" \
    -e IS_E2E="$IS_E2E" \
    -e NEXT_PUBLIC_IS_E2E="$NEXT_PUBLIC_IS_E2E" \
    "$IMAGE" \
    /bin/bash -c '
        set -e
        if [ ! -d "node_modules" ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
            echo "Installing dependencies..."
            NODE_ENV=development npm install
        fi
        NODE_ENV=production npm run build "$@"
    ' bash "$@"
