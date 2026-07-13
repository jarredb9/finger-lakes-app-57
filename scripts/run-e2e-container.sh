#!/bin/bash

# scripts/run-e2e-container.sh
# Purpose: Run Playwright tests in a container (Rootless) on RHEL 8.

set -e

# 1. Configuration
PLAYWRIGHT_VERSION="v1.58.2-noble"
IMAGE="mcr.microsoft.com/playwright:$PLAYWRIGHT_VERSION"

# Parse optional flags
SHOULD_BUILD=false
USE_LIVE=false
while [[ "$#" -gt 0 ]]; do
    case $1 in
        -b|--build) SHOULD_BUILD=true; shift ;;
        -l|--live) USE_LIVE=true; shift ;;
        *) break ;; # Stop parsing if we hit the project arg or a filename
    esac
done

# Cleanup handler to prevent local storage state leakage
cleanup() {
    echo "🧹 Cleaning up test storage..."
    rm -rf test-results/.storage
}
trap cleanup EXIT

PROJECT_ARG=$1

echo "🚀 Starting Playwright Containerized Tests (Rootless)..."
echo "📦 Image: $IMAGE"

# Detect container engine (prefer podman, fallback to docker)
if command -v podman >/dev/null 2>&1; then
    ENGINE="podman"
elif command -v docker >/dev/null 2>&1; then
    ENGINE="docker"
else
    echo "❌ Error: Neither podman nor docker was found on this system." >&2
    exit 1
fi

# Detect TTY/CI environment to set interactive flags safely
INTERACTIVE_FLAG="-t"
if [ -t 0 ] && [ "$CI" != "true" ]; then
    INTERACTIVE_FLAG="-it"
fi

# Set engine-specific arguments
EXTRA_OPTS=()
if [ "$ENGINE" = "podman" ]; then
    EXTRA_OPTS+=( "--userns=keep-id" )
else
    # Docker needs to run as the host user to prevent root-owned files in workspace mount
    EXTRA_OPTS+=( "--user" "$(id -u):$(id -g)" )
fi

if [ "$USE_LIVE" = true ]; then
    echo "🌍 Using LIVE database..."
    if [ -f .env.local.production ]; then
        set -a
        source .env.local.production
        set +a
    else
        echo "⚠️  No .env.local.production file found. Relying on host environment variables."
    fi
    E2E_REAL_DATA="true"
else
    echo "🏠 Using LOCAL database stack..."
    if [ -f .env.local ]; then
        set -a
        source .env.local
        set +a
    else
        echo "⚠️  No .env.local file found. Relying on host environment variables."
    fi
    E2E_REAL_DATA="false"
fi

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
if [ "$ENGINE" = "podman" ]; then
    if ! podman image exists "$IMAGE"; then
        echo "📥 Pulling Playwright image..."
        podman pull "$IMAGE"
    fi
else
    if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
        echo "📥 Pulling Playwright image..."
        docker pull "$IMAGE"
    fi
fi

# 3. Run the container
# Use a unique name to prevent stale container persistence
CONTAINER_NAME="winery-e2e-$(date +%s)"
$ENGINE stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
$ENGINE rm "$CONTAINER_NAME" >/dev/null 2>&1 || true

# Flush filesystem to ensure volume mount sees latest changes
sync

$ENGINE run --rm $INTERACTIVE_FLAG \
    --name "$CONTAINER_NAME" \
    --network=host \
    -v "$(pwd):/work:Z" \
    "${EXTRA_OPTS[@]}" \
    --security-opt label=disable \
    --security-opt seccomp=unconfined \
    -w /work \
    -e IS_E2E=true \
    -e NEXT_PUBLIC_IS_E2E=true \
    -e NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
    -e NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
    -e SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
    -e E2E_REAL_DATA="$E2E_REAL_DATA" \
    -e TEST_CMD="$TEST_CMD" \
    -e SHOULD_BUILD="$SHOULD_BUILD" \
    -e TEST_USER_EMAIL="$TEST_USER_EMAIL" \
    -e TEST_USER_PASSWORD="$TEST_USER_PASSWORD" \
    -e BASE_URL="$BASE_URL" \
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
