#!/bin/bash

# scripts/__tests__/run-e2e-container.test.sh
# Purpose: Unit tests for scripts/run-e2e-container.sh CLI argument parsing, zero-argument safety, and container options.

set -u

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_UNDER_TEST="$PROJECT_ROOT/scripts/run-e2e-container.sh"

TEMP_DIR=$(mktemp -d)
MOCK_LOG="$TEMP_DIR/mock_exec.log"

cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# Create mock bin directory
MOCK_BIN="$TEMP_DIR/bin"
mkdir -p "$MOCK_BIN"

# Create mock podman
cat << 'EOF' > "$MOCK_BIN/podman"
#!/bin/bash
if [ "${1:-}" = "image" ] && [ "${2:-}" = "exists" ]; then
    exit 0
fi
if [ "${1:-}" = "stop" ] || [ "${1:-}" = "rm" ]; then
    exit 0
fi
if [ "${1:-}" = "run" ]; then
    echo "CMD: $@" >> "$MOCK_LOG"
    while [[ $# -gt 0 ]]; do
        if [ "$1" = "-e" ]; then
            echo "ENV: $2" >> "$MOCK_LOG"
            shift 2
        elif [ "$1" = "-v" ]; then
            echo "VOL: $2" >> "$MOCK_LOG"
            shift 2
        else
            shift
        fi
    done
    exit 0
fi
exit 0
EOF
chmod +x "$MOCK_BIN/podman"

# Create mock docker
cat << 'EOF' > "$MOCK_BIN/docker"
#!/bin/bash
if [ "${1:-}" = "image" ] && [ "${2:-}" = "inspect" ]; then
    exit 0
fi
if [ "${1:-}" = "stop" ] || [ "${1:-}" = "rm" ]; then
    exit 0
fi
if [ "${1:-}" = "run" ]; then
    echo "CMD: $@" >> "$MOCK_LOG"
    while [[ $# -gt 0 ]]; do
        if [ "$1" = "-e" ]; then
            echo "ENV: $2" >> "$MOCK_LOG"
            shift 2
        elif [ "$1" = "-v" ]; then
            echo "VOL: $2" >> "$MOCK_LOG"
            shift 2
        else
            shift
        fi
    done
    exit 0
fi
exit 0
EOF
chmod +x "$MOCK_BIN/docker"

# Test counter
PASSED=0
FAILED=0

run_test() {
    local test_name="$1"
    local expected_pattern="$2"
    shift 2
    local args=("$@")

    rm -f "$MOCK_LOG"
    touch "$MOCK_LOG"

    echo -n "Running test: $test_name... "

    # Execute with mock container engine
    set +e
    (
        export PATH="$MOCK_BIN:$PATH"
        export CONTAINER_ENGINE="podman"
        export MOCK_LOG="$MOCK_LOG"
        export CI="false"
        cd "$PROJECT_ROOT"
        "$SCRIPT_UNDER_TEST" "${args[@]}" > "$TEMP_DIR/stdout.log" 2> "$TEMP_DIR/stderr.log"
    )
    local exit_code=$?
    set -e

    local log_content=""
    if [ -f "$MOCK_LOG" ]; then
        log_content=$(cat "$MOCK_LOG")
    fi

    if [ $exit_code -eq 0 ] && [[ "$log_content" =~ $expected_pattern ]]; then
        echo "✓ PASSED"
        PASSED=$((PASSED + 1))
    else
        echo "✗ FAILED"
        echo "  Exit code: $exit_code"
        echo "  Expected pattern: $expected_pattern"
        echo "  Actual mock log:"
        echo "  ----------------"
        cat "$MOCK_LOG" | sed 's/^/  /'
        echo "  Stdout:"
        cat "$TEMP_DIR/stdout.log" | sed 's/^/  /'
        echo "  Stderr:"
        cat "$TEMP_DIR/stderr.log" | sed 's/^/  /'
        echo "  ----------------"
        FAILED=$((FAILED + 1))
    fi
}

echo "=== Running scripts/run-e2e-container.sh Unit Tests (Phase 4 Task 1) ==="

# 1. Zero-argument safety: should default project to webkit without crashing on shift
run_test "Zero arguments defaults to webkit and does not crash" \
    "ENV: TEST_CMD=npx playwright test --project=\"webkit\""

# 2. Spec file path without project: should default to webkit and pass spec path
run_test "Spec file path without project defaults to webkit" \
    "ENV: TEST_CMD=npx playwright test --project=\"webkit\" e2e/trip-flow.spec.ts" \
    "e2e/trip-flow.spec.ts"

# 3. CLI flag passthrough without project: should default to webkit and pass flags
run_test "CLI flag passthrough without project defaults to webkit" \
    "ENV: TEST_CMD=npx playwright test --project=\"webkit\" --grep @smoke" \
    "--grep" "@smoke"

# 4. Explicit project with spec path
run_test "Explicit project with spec path sets project correctly" \
    "ENV: TEST_CMD=npx playwright test --project=\"chromium\" e2e/trip-flow.spec.ts" \
    "chromium" "e2e/trip-flow.spec.ts"

# 5. Project alias resolution: mobile-safari -> Mobile Safari
run_test "Project alias mobile-safari maps to Mobile Safari" \
    "ENV: TEST_CMD=npx playwright test --project=\"Mobile Safari\" e2e/trip-flow.spec.ts" \
    "mobile-safari" "e2e/trip-flow.spec.ts"

# 6. Project 'all' runs without --project filter
run_test "Project 'all' executes without --project argument" \
    "ENV: TEST_CMD=npx playwright test e2e/trip-flow.spec.ts" \
    "all" "e2e/trip-flow.spec.ts"

# 7. Volume isolation: container mount must include /work/node_modules isolation
run_test "Container volume isolation protects host node_modules" \
    "VOL: /work/node_modules"

echo ""
echo "=== Test Results: $PASSED passed, $FAILED failed ==="

if [ $FAILED -gt 0 ]; then
    exit 1
fi
exit 0
