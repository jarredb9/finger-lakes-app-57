#!/bin/bash

# scripts/run-e2e-container.sh
# Purpose: Run Playwright tests in a container (Rootless) on RHEL 8.

set -e

# 1. Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/container-common.sh"

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

echo "🚀 Starting Playwright Containerized Tests (Rootless)..."
echo "📦 Image: $IMAGE"

# Setup container engine and pre-flight validation
setup_container_engine

# Detect TTY/CI environment to set interactive flags safely
INTERACTIVE_FLAG=""
if [ -t 0 ] && [ "$CI" != "true" ]; then
    INTERACTIVE_FLAG="-it"
fi

# Capture any caller-provided overrides before sourcing env files
ORIG_TEST_USER_EMAIL="$TEST_USER_EMAIL"
ORIG_TEST_USER_PASSWORD="$TEST_USER_PASSWORD"
ORIG_BASE_URL="$BASE_URL"

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

# Re-apply caller-provided overrides
if [ -n "$ORIG_TEST_USER_EMAIL" ]; then TEST_USER_EMAIL="$ORIG_TEST_USER_EMAIL"; fi
if [ -n "$ORIG_TEST_USER_PASSWORD" ]; then TEST_USER_PASSWORD="$ORIG_TEST_USER_PASSWORD"; fi
if [ -n "$ORIG_BASE_URL" ]; then BASE_URL="$ORIG_BASE_URL"; fi

if [ "$SHOULD_BUILD" = true ]; then
    echo "🏗️  Forcing a fresh container production build (run-build-container.sh) and clearing isolated storage..."
    rm -rf .next 2>/dev/null || true
    rm -rf test-results/.storage 2>/dev/null || true
    NEXT_PUBLIC_IS_E2E=true IS_E2E=true "$SCRIPT_DIR/run-build-container.sh"
fi

# Determine command based on argument
PROJECT=""
USE_PROJECT_FLAG=true

if [ "$#" -eq 0 ]; then
    PROJECT="webkit"
elif [ "$1" = "all" ]; then
    USE_PROJECT_FLAG=false
    shift
elif [ "$1" = "chromium" ] || [ "$1" = "webkit" ] || [ "$1" = "firefox" ]; then
    PROJECT="$1"
    shift
elif [ "$1" = "mobile-safari" ] || [ "$1" = "Mobile Safari" ]; then
    PROJECT="Mobile Safari"
    shift
elif [ "$1" = "mobile-chrome" ] || [ "$1" = "Mobile Chrome" ]; then
    PROJECT="Mobile Chrome"
    shift
elif [ "$1" = "tablet-safari" ] || [ "$1" = "Mobile Safari (Tablet)" ]; then
    PROJECT="Mobile Safari (Tablet)"
    shift
else
    # $1 is a spec path, flag, or unrecognized option; default project to webkit and retain $1
    PROJECT="webkit"
fi

TEST_ARGS=("$@")

if [ "$USE_PROJECT_FLAG" = true ]; then
    echo "🌐 Project: $PROJECT"
    if [ ${#TEST_ARGS[@]} -gt 0 ]; then
        TEST_CMD="npx playwright test --project=\"$PROJECT\" ${TEST_ARGS[*]}"
    else
        TEST_CMD="npx playwright test --project=\"$PROJECT\""
    fi
else
    echo "🌐 Project: ALL (Running full suite)"
    if [ ${#TEST_ARGS[@]} -gt 0 ]; then
        TEST_CMD="npx playwright test ${TEST_ARGS[*]}"
    else
        TEST_CMD="npx playwright test"
    fi
fi

# 2. Ensure we have the image
ensure_container_image "$IMAGE" "Playwright image"

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
    -e CI="$CI" \
    -e IS_E2E=true \
    -e NEXT_PUBLIC_IS_E2E=true \
    -e NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
    -e NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
    -e SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
    -e E2E_REAL_DATA="$E2E_REAL_DATA" \
    -e VERBOSE="$VERBOSE" \
    -e DEBUG_E2E="$DEBUG_E2E" \
    -e TEST_CMD="$TEST_CMD" \
    -e TEST_USER_EMAIL="$TEST_USER_EMAIL" \
    -e TEST_USER_PASSWORD="$TEST_USER_PASSWORD" \
    -e BASE_URL="$BASE_URL" \
    "$IMAGE" \
    /bin/bash -c '
        set -e
        if [ ! -d "node_modules" ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
            if [ -z "$INTERACTIVE_FLAG" ] && [ "$VERBOSE" != "true" ]; then
                npm install --silent >/dev/null 2>&1 || npm install
            else
                echo "Installing dependencies..."
                npm install
            fi
        fi

        echo "🎬 Running inside container: $TEST_CMD"
        eval "$TEST_CMD"
    '

echo "✅ Tests completed."
