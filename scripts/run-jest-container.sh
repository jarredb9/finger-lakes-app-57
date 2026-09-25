#!/bin/bash

# scripts/run-jest-container.sh
# Purpose: Run Jest tests in a container (Rootless) on RHEL 8 to bypass glibc < 2.29 SWC limitations.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/container-common.sh"

# 1. Environment & Pre-flight
setup_container_engine

# Only allocate an interactive TTY if --watch is explicitly requested in a terminal
INTERACTIVE_FLAG=""
if [[ " $* " =~ " --watch" ]] && [ -t 0 ] && [ "$CI" != "true" ]; then
    INTERACTIVE_FLAG="-it"
fi

# 2. Ensure we have the image
ensure_container_image "$IMAGE"

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
