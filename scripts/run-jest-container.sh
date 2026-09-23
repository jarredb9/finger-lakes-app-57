#!/bin/bash

# scripts/run-jest-container.sh
# Purpose: Run Jest tests in a container (Rootless) on RHEL 8 to bypass glibc < 2.29 SWC limitations.

set -e

# 1. Configuration
# Re-use the existing Playwright noble image which contains Ubuntu 24.04 (glibc 2.39) and Node
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

# Only allocate an interactive TTY if --watch is explicitly requested in a terminal
INTERACTIVE_FLAG=""
if [[ " $* " =~ " --watch" ]] && [ -t 0 ] && [ "$CI" != "true" ]; then
    INTERACTIVE_FLAG="-it"
fi

# Set engine-specific arguments
EXTRA_OPTS=()
if [ "$ENGINE" = "podman" ]; then
    EXTRA_OPTS+=( "--userns=keep-id" )
else
    # Docker needs to run as host user to prevent root-owned file creation
    EXTRA_OPTS+=( "--user" "$(id -u):$(id -g)" )
fi

# 2. Ensure we have the image
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

# 3. Run container
CONTAINER_NAME="winery-jest-$(date +%s)"
$ENGINE stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
$ENGINE rm "$CONTAINER_NAME" >/dev/null 2>&1 || true

# Flush filesystem to ensure volume mount sees latest changes
sync

echo "🧪 Running Jest in container ($ENGINE)..."

$ENGINE run --rm $INTERACTIVE_FLAG \
    --name "$CONTAINER_NAME" \
    --network=host \
    -v "$(pwd):/work:Z" \
    "${EXTRA_OPTS[@]}" \
    --security-opt label=disable \
    --security-opt seccomp=unconfined \
    -w /work \
    -e CI="$CI" \
    -e TEST_TYPE="$TEST_TYPE" \
    -e NODE_ENV="test" \
    -e INTERACTIVE_FLAG="$INTERACTIVE_FLAG" \
    -e VERBOSE="$VERBOSE" \
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
        if [ -z "$INTERACTIVE_FLAG" ] && [ "$VERBOSE" != "true" ]; then
            TMP_OUT=$(mktemp)
            if npx jest --ci "$@" > "$TMP_OUT" 2>&1; then
                tail -n 10 "$TMP_OUT" | grep -E "(Test Suites:|Tests:|Snapshots:|Time:|Ran all test suites)" || cat "$TMP_OUT"
                rm -f "$TMP_OUT"
                exit 0
            else
                EXIT_CODE=$?
                cat "$TMP_OUT"
                rm -f "$TMP_OUT"
                exit $EXIT_CODE
            fi
        else
            npx jest "$@"
        fi
    ' bash "$@"
