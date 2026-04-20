#!/bin/bash

# scripts/run-e2e-container.sh
# Purpose: Run Playwright tests in a container (Rootless) on RHEL 8.

set -e

# 1. Configuration
PLAYWRIGHT_VERSION="v1.58.0-noble"
IMAGE="mcr.microsoft.com/playwright:$PLAYWRIGHT_VERSION"

# Parse optional flags
SHOULD_BUILD=false
while [[ "$#" -gt 0 ]]; do
    case $1 in
        -b|--build) SHOULD_BUILD=true; shift ;;
        *) break ;; # Stop parsing if we hit the project arg or a filename
    esac
done

PROJECT_ARG=$1

echo "🚀 Starting Playwright Containerized Tests (Rootless)..."
echo "📦 Image: $IMAGE"

if [ "$SHOULD_BUILD" = true ]; then
    echo "🏗️  Forcing a fresh production build and clearing isolated storage..."
    rm -rf .next
    rm -rf test-results/.storage
fi

# Determine command based on argument
if [ "$PROJECT_ARG" == "all" ]; then
    echo "🌐 Project: ALL (Running full suite)"
    # Shift to get remaining args
    shift
    TEST_CMD="npx playwright test $*"
else
    PROJECT="${PROJECT_ARG:-webkit}"
    echo "🌐 Project: $PROJECT"
    # Shift to get remaining args
    shift
    TEST_CMD="npx playwright test --project=\"$PROJECT\" $*"
fi

# 2. Ensure we have the image
if ! podman image exists "$IMAGE"; then
    echo "📥 Pulling Playwright image..."
    podman pull "$IMAGE"
fi

# 3. Run the container
# Use a unique name to prevent stale container persistence
CONTAINER_NAME="winery-e2e-$(date +%s)"
podman stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
podman rm "$CONTAINER_NAME" >/dev/null 2>&1 || true

# Flush filesystem to ensure volume mount sees latest changes
sync

podman run --rm -it \
    --name "$CONTAINER_NAME" \
    --network=host \
    -v "$(pwd):/work:Z" \
    --userns=keep-id \
    --security-opt label=disable \
    --security-opt seccomp=unconfined \
    -w /work \
    -e IS_E2E=true \
    -e NEXT_PUBLIC_IS_E2E=true \
    -e E2E_REAL_DATA="$E2E_REAL_DATA" \
    -e TEST_CMD="$TEST_CMD" \
    -e SHOULD_BUILD="$SHOULD_BUILD" \
    "$IMAGE" \
    /bin/bash -c '
        if [ ! -d "node_modules" ]; then
            echo "Installing dependencies..."
            npm install
        fi

        if [ "$SHOULD_BUILD" = "true" ]; then
            echo "🧹 Cleaning and building inside container..."
            echo "🔍 Sanity Check: e2e/utils.ts console listener:"
            grep -A 5 "page.on(" e2e/utils.ts
            rm -rf .next
            npm install
            npm run build
        fi
        
        echo "🎬 Running inside container: $TEST_CMD"
        eval "$TEST_CMD"
    '

echo "✅ Tests completed."
