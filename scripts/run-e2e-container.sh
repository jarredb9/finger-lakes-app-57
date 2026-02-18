#!/bin/bash

# scripts/run-e2e-container.sh
# Purpose: Run Playwright tests in a container (Rootless) on RHEL 8.

set -e

# 1. Configuration
PLAYWRIGHT_VERSION="v1.58.0-noble"
IMAGE="mcr.microsoft.com/playwright:$PLAYWRIGHT_VERSION"
PROJECT_ARG=$1

echo "🚀 Starting Playwright Containerized Tests (Rootless)..."
echo "📦 Image: $IMAGE"

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
# We pass the TEST_CMD as an environment variable to avoid shell escaping issues with parentheses/spaces
podman run --rm -it \
    --network=host \
    -v "$(pwd):/work:Z" \
    --userns=keep-id \
    --security-opt label=disable \
    --security-opt seccomp=unconfined \
    -w /work \
    -e IS_E2E=true \
    -e TEST_CMD="$TEST_CMD" \
    "$IMAGE" \
    /bin/bash -c '
        if [ ! -d "node_modules" ]; then
            echo "Installing dependencies..."
            npm install
        fi
        
        echo "🎬 Running inside container: $TEST_CMD"
        eval "$TEST_CMD"
    '

echo "✅ Tests completed."
