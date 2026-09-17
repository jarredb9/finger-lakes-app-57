#!/bin/bash

# scripts/run-dev-container.sh
# Purpose: Run Next.js dev server with native Turbopack inside container (Ubuntu 24.04 / glibc 2.39) on RHEL 8.

set -e

# 1. Configuration
PLAYWRIGHT_VERSION="v1.63.0-noble"
IMAGE="mcr.microsoft.com/playwright:$PLAYWRIGHT_VERSION"

# Detect container engine (honor CONTAINER_ENGINE env var, prefer docker in CI, fallback to podman locally)
if [ -n "$CONTAINER_ENGINE" ]; then
    ENGINE="$CONTAINER_ENGINE"
elif [ "$CI" = "true" ] && command -v docker >/dev/null 2>&1; then
    ENGINE="docker"
elif command -v podman >/dev/null 2>&1; then
    ENGINE="podman"
elif command -v docker >/dev/null 2>&1; then
    ENGINE="docker"
else
    echo "❌ Error: Neither podman nor docker was found on this system." >&2
    exit 1
fi

# Detect TTY environment
INTERACTIVE_FLAG="-t"
if [ -t 0 ]; then
    INTERACTIVE_FLAG="-it"
fi

# Set engine-specific arguments
EXTRA_OPTS=()
if [ "$ENGINE" = "podman" ]; then
    EXTRA_OPTS+=( "--userns=keep-id" )
else
    EXTRA_OPTS+=( "--user" "$(id -u):$(id -g)" )
fi

# 2. Ensure image exists
if [ "$ENGINE" = "podman" ]; then
    if ! podman image exists "$IMAGE"; then
        echo "📥 Pulling image $IMAGE..."
        podman pull "$IMAGE"
    fi
else
    if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
        echo "📥 Pulling image $IMAGE..."
        docker pull "$IMAGE"
    fi
fi

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
    -v /work/node_modules \
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
        if [ ! -d "node_modules" ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
            echo "Installing dependencies..."
            npm install
        fi
        npm run dev "$@"
    ' bash "$@"
