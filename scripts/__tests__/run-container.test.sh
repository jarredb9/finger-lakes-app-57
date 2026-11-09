#!/bin/bash

# scripts/__tests__/run-container.test.sh
# Purpose: Unit tests for container runner scripts CLI argument parsing, zero-argument safety, and container volume options.

set -u

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

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
    if [ "${MOCK_IMAGE_EXISTS:-true}" = "false" ]; then
        exit 1
    fi
    exit 0
fi
if [ "${1:-}" = "pull" ]; then
    image="${2:-}"
    if [ -n "${MOCK_LOG:-}" ]; then
        echo "PULL: $image" >> "$MOCK_LOG"
    fi
    fail_threshold="${MOCK_PULL_FAIL_COUNT:-0}"
    if [ "$fail_threshold" -gt 0 ]; then
        count_file="${MOCK_PULL_COUNT_FILE:-${MOCK_LOG:-/tmp/mock}.podman_pull_count}"
        current_count=0
        if [ -f "$count_file" ]; then
            current_count=$(cat "$count_file")
        fi
        current_count=$((current_count + 1))
        echo "$current_count" > "$count_file"
        if [ "$current_count" -le "$fail_threshold" ]; then
            exit 1
        fi
    fi
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
    if [ "${MOCK_IMAGE_EXISTS:-true}" = "false" ]; then
        exit 1
    fi
    exit 0
fi
if [ "${1:-}" = "pull" ]; then
    image="${2:-}"
    if [ -n "${MOCK_LOG:-}" ]; then
        echo "PULL: $image" >> "$MOCK_LOG"
    fi
    fail_threshold="${MOCK_PULL_FAIL_COUNT:-0}"
    if [ "$fail_threshold" -gt 0 ]; then
        count_file="${MOCK_PULL_COUNT_FILE:-${MOCK_LOG:-/tmp/mock}.docker_pull_count}"
        current_count=0
        if [ -f "$count_file" ]; then
            current_count=$(cat "$count_file")
        fi
        current_count=$((current_count + 1))
        echo "$current_count" > "$count_file"
        if [ "$current_count" -le "$fail_threshold" ]; then
            exit 1
        fi
    fi
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

run_script_test() {
    local script_path="$1"
    local test_name="$2"
    local expected_pattern="$3"
    shift 3
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
        "$script_path" "${args[@]}" > "$TEMP_DIR/stdout.log" 2> "$TEMP_DIR/stderr.log"
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

run_script_not_pattern_test() {
    local script_path="$1"
    local test_name="$2"
    local forbidden_pattern="$3"
    local engine="${4:-podman}"
    local ci_env="${5:-false}"

    rm -f "$MOCK_LOG"
    touch "$MOCK_LOG"

    echo -n "Running test: $test_name... "

    set +e
    (
        export PATH="$MOCK_BIN:$PATH"
        export CONTAINER_ENGINE="$engine"
        export MOCK_LOG="$MOCK_LOG"
        export CI="$ci_env"
        cd "$PROJECT_ROOT"
        "$script_path" > "$TEMP_DIR/stdout.log" 2> "$TEMP_DIR/stderr.log"
    )
    local exit_code=$?
    set -e

    local log_content=""
    if [ -f "$MOCK_LOG" ]; then
        log_content=$(cat "$MOCK_LOG")
    fi

    if [ $exit_code -eq 0 ] && ! [[ "$log_content" =~ $forbidden_pattern ]]; then
        echo "✓ PASSED"
        PASSED=$((PASSED + 1))
    else
        echo "✗ FAILED"
        echo "  Exit code: $exit_code"
        echo "  Forbidden pattern found: $forbidden_pattern"
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

E2E_SCRIPT="$PROJECT_ROOT/scripts/containers/run-e2e-container.sh"
JEST_SCRIPT="$PROJECT_ROOT/scripts/containers/run-jest-container.sh"
DEV_SCRIPT="$PROJECT_ROOT/scripts/containers/run-dev-container.sh"
BUILD_SCRIPT="$PROJECT_ROOT/scripts/containers/run-build-container.sh"

echo "=== Running scripts/containers/run-e2e-container.sh Unit Tests (Phase 4 Task 1) ==="

# 1. Zero-argument safety: should default project to webkit without crashing on shift
run_script_test "$E2E_SCRIPT" "E2E: Zero arguments defaults to webkit and does not crash" \
    "npx playwright test --project=webkit"

# 2. Spec file path without project: should default to webkit and pass spec path
run_script_test "$E2E_SCRIPT" "E2E: Spec file path without project defaults to webkit" \
    "npx playwright test --project=webkit e2e/trip-flow.spec.ts" \
    "e2e/trip-flow.spec.ts"

# 3. CLI flag passthrough without project: should default to webkit and pass flags
run_script_test "$E2E_SCRIPT" "E2E: CLI flag passthrough without project defaults to webkit" \
    "npx playwright test --project=webkit --grep @smoke" \
    "--grep" "@smoke"

# 4. Explicit project with spec path
run_script_test "$E2E_SCRIPT" "E2E: Explicit project with spec path sets project correctly" \
    "npx playwright test --project=chromium e2e/trip-flow.spec.ts" \
    "chromium" "e2e/trip-flow.spec.ts"

# 5. Project alias resolution: mobile-safari -> Mobile Safari
run_script_test "$E2E_SCRIPT" "E2E: Project alias mobile-safari maps to Mobile Safari" \
    "npx playwright test --project=Mobile Safari e2e/trip-flow.spec.ts" \
    "mobile-safari" "e2e/trip-flow.spec.ts"

# 6. Project 'all' runs without --project filter
run_script_test "$E2E_SCRIPT" "E2E: Project 'all' executes without --project argument" \
    "npx playwright test e2e/trip-flow.spec.ts" \
    "all" "e2e/trip-flow.spec.ts"

# 7. Workspace mount: container mount must mount workspace with :Z
run_script_test "$E2E_SCRIPT" "E2E: Container mounts workspace root with :Z" \
    "VOL: $PROJECT_ROOT:/work:Z"

# 8. --build flag triggers container production build via run-build-container.sh
run_script_test "$E2E_SCRIPT" "E2E: --build flag triggers run-build-container.sh" \
    "winery-build-" \
    "--build" "webkit" "e2e/trip-flow.spec.ts"

echo ""
echo "=== Running Jest/Dev/Build Container Runner Script Tests ==="

# 9. Jest container script workspace mount
run_script_test "$JEST_SCRIPT" "Jest: Container mounts workspace root with :Z" \
    "VOL: $PROJECT_ROOT:/work:Z"

# 10. Dev container script workspace mount
run_script_test "$DEV_SCRIPT" "Dev: Container mounts workspace root with :Z" \
    "VOL: $PROJECT_ROOT:/work:Z"

# 11. Build container script workspace mount
run_script_test "$BUILD_SCRIPT" "Build: Container mounts workspace root with :Z" \
    "VOL: $PROJECT_ROOT:/work:Z"

echo ""
echo "=== Running Volume Masking Regression Tests (Prevent EACCES) ==="

# 12. E2E container must not mount anonymous /work/node_modules
run_script_not_pattern_test "$E2E_SCRIPT" "E2E: Does not mask node_modules with anonymous volume" \
    "VOL: /work/node_modules"

# 13. Jest container must not mount anonymous /work/node_modules
run_script_not_pattern_test "$JEST_SCRIPT" "Jest: Does not mask node_modules with anonymous volume" \
    "VOL: /work/node_modules"

# 14. Dev container must not mount anonymous /work/node_modules
run_script_not_pattern_test "$DEV_SCRIPT" "Dev: Does not mask node_modules with anonymous volume" \
    "VOL: /work/node_modules"

# 15. Build container must not mount anonymous /work/node_modules
run_script_not_pattern_test "$BUILD_SCRIPT" "Build: Does not mask node_modules with anonymous volume" \
    "VOL: /work/node_modules"

# 16. Docker CI environment: must use --user and mount workspace without node_modules masking
run_script_not_pattern_test "$E2E_SCRIPT" "Docker CI: Preserves host node_modules without volume masking" \
    "VOL: /work/node_modules" "docker" "true"

echo ""
echo "=== Running scripts/containers/container-common.sh Library Unit Tests ==="

test_common_vars() {
    echo -n "Running test: Common: Exports PLAYWRIGHT_VERSION and valid image... "
    set +e
    local output
    output=$(bash -c "source '$PROJECT_ROOT/scripts/containers/container-common.sh' && echo \"\$PLAYWRIGHT_VERSION \$IMAGE\"")
    set -e
    if [[ "$output" == "v1.64.1-noble mcr.microsoft.com/playwright:v1.64.1-noble" ]]; then
        echo "✓ PASSED"
        PASSED=$((PASSED + 1))
    else
        echo "✗ FAILED (got: $output)"
        FAILED=$((FAILED + 1))
    fi
}
test_common_vars

test_common_engine_override() {
    echo -n "Running test: Common: Honors CONTAINER_ENGINE override... "
    set +e
    local output
    output=$(bash -c "export CONTAINER_ENGINE=custom-engine && source '$PROJECT_ROOT/scripts/containers/container-common.sh' && detect_container_engine && echo \"\$ENGINE\"")
    set -e
    if [[ "$output" == "custom-engine" ]]; then
        echo "✓ PASSED"
        PASSED=$((PASSED + 1))
    else
        echo "✗ FAILED (got: $output)"
        FAILED=$((FAILED + 1))
    fi
}
test_common_engine_override

test_common_ci_docker() {
    echo -n "Running test: Common: Selects docker when CI=true... "
    set +e
    local output
    output=$(PATH="$MOCK_BIN:$PATH" bash -c "export CI=true && source '$PROJECT_ROOT/scripts/containers/container-common.sh' && detect_container_engine && echo \"\$ENGINE\"")
    set -e
    if [[ "$output" == "docker" ]]; then
        echo "✓ PASSED"
        PASSED=$((PASSED + 1))
    else
        echo "✗ FAILED (got: $output)"
        FAILED=$((FAILED + 1))
    fi
}
test_common_ci_docker

echo ""
echo "=== Running ensure_container_image() Retry & Backoff Unit Tests ==="

test_ensure_container_image_cached() {
    local engine="${1:-podman}"
    echo -n "Running test: ensure_container_image ($engine): Skips pull when image is cached locally... "
    rm -f "$MOCK_LOG" "${MOCK_LOG}."*
    touch "$MOCK_LOG"
    set +e
    local stdout_log="$TEMP_DIR/ensure_cached_out.log"
    local stderr_log="$TEMP_DIR/ensure_cached_err.log"
    (
        export PATH="$MOCK_BIN:$PATH"
        export CONTAINER_ENGINE="$engine"
        export MOCK_LOG="$MOCK_LOG"
        export MOCK_IMAGE_EXISTS="true"
        export CONTAINER_PULL_INITIAL_BACKOFF=0
        source "$PROJECT_ROOT/scripts/containers/container-common.sh"
        ENGINE="$engine"
        ensure_container_image "test-image:latest" "test-image"
    ) > "$stdout_log" 2> "$stderr_log"
    local exit_code=$?
    set -e

    if [ $exit_code -eq 0 ] && ! grep -q "PULL:" "$MOCK_LOG" && [ ! -s "$stdout_log" ]; then
        echo "✓ PASSED"
        PASSED=$((PASSED + 1))
    else
        echo "✗ FAILED (exit: $exit_code, log: $(cat "$MOCK_LOG" 2>/dev/null), stdout: $(cat "$stdout_log" 2>/dev/null))"
        FAILED=$((FAILED + 1))
    fi
}
test_ensure_container_image_cached "podman"
test_ensure_container_image_cached "docker"

test_ensure_container_image_pull_immediate_success() {
    local engine="${1:-podman}"
    echo -n "Running test: ensure_container_image ($engine): Pulls image on cache miss (immediate success)... "
    rm -f "$MOCK_LOG" "${MOCK_LOG}."*
    touch "$MOCK_LOG"
    set +e
    local stdout_log="$TEMP_DIR/ensure_pull_success_out.log"
    local stderr_log="$TEMP_DIR/ensure_pull_success_err.log"
    (
        export PATH="$MOCK_BIN:$PATH"
        export CONTAINER_ENGINE="$engine"
        export MOCK_LOG="$MOCK_LOG"
        export MOCK_IMAGE_EXISTS="false"
        export MOCK_PULL_FAIL_COUNT=0
        export CONTAINER_PULL_INITIAL_BACKOFF=0
        source "$PROJECT_ROOT/scripts/containers/container-common.sh"
        ENGINE="$engine"
        ensure_container_image "test-image:latest" "test-image"
    ) > "$stdout_log" 2> "$stderr_log"
    local exit_code=$?
    set -e

    local pull_count
    pull_count=$(grep -c "PULL: test-image:latest" "$MOCK_LOG" || true)

    if [ $exit_code -eq 0 ] && [ "$pull_count" -eq 1 ] && grep -q "📥 Pulling test-image (attempt 1/3)..." "$stdout_log"; then
        echo "✓ PASSED"
        PASSED=$((PASSED + 1))
    else
        echo "✗ FAILED (exit: $exit_code, pulls: $pull_count, stdout: $(cat "$stdout_log" 2>/dev/null))"
        FAILED=$((FAILED + 1))
    fi
}
test_ensure_container_image_pull_immediate_success "podman"
test_ensure_container_image_pull_immediate_success "docker"

test_ensure_container_image_pull_retry_success() {
    local engine="${1:-podman}"
    echo -n "Running test: ensure_container_image ($engine): Retries on transient failure and succeeds... "
    rm -f "$MOCK_LOG" "${MOCK_LOG}."*
    touch "$MOCK_LOG"
    set +e
    local stdout_log="$TEMP_DIR/ensure_retry_success_out.log"
    local stderr_log="$TEMP_DIR/ensure_retry_success_err.log"
    (
        export PATH="$MOCK_BIN:$PATH"
        export CONTAINER_ENGINE="$engine"
        export MOCK_LOG="$MOCK_LOG"
        export MOCK_IMAGE_EXISTS="false"
        export MOCK_PULL_FAIL_COUNT=1
        export CONTAINER_PULL_INITIAL_BACKOFF=0
        source "$PROJECT_ROOT/scripts/containers/container-common.sh"
        ENGINE="$engine"
        ensure_container_image "test-image:latest" "test-image"
    ) > "$stdout_log" 2> "$stderr_log"
    local exit_code=$?
    set -e

    local pull_count
    pull_count=$(grep -c "PULL: test-image:latest" "$MOCK_LOG" || true)

    if [ $exit_code -eq 0 ] && [ "$pull_count" -eq 2 ] && \
       grep -q "⚠️  Pull failed for test-image (attempt 1/3). Retrying in 0s..." "$stderr_log" && \
       grep -q "📥 Pulling test-image (attempt 2/3)..." "$stdout_log"; then
        echo "✓ PASSED"
        PASSED=$((PASSED + 1))
    else
        echo "✗ FAILED (exit: $exit_code, pulls: $pull_count, stderr: $(cat "$stderr_log" 2>/dev/null))"
        FAILED=$((FAILED + 1))
    fi
}
test_ensure_container_image_pull_retry_success "podman"
test_ensure_container_image_pull_retry_success "docker"

test_ensure_container_image_pull_exhausted_retries() {
    local engine="${1:-podman}"
    echo -n "Running test: ensure_container_image ($engine): Returns 1 and logs error when retries exhausted... "
    rm -f "$MOCK_LOG" "${MOCK_LOG}."*
    touch "$MOCK_LOG"
    set +e
    local stdout_log="$TEMP_DIR/ensure_exhausted_out.log"
    local stderr_log="$TEMP_DIR/ensure_exhausted_err.log"
    (
        export PATH="$MOCK_BIN:$PATH"
        export CONTAINER_ENGINE="$engine"
        export MOCK_LOG="$MOCK_LOG"
        export MOCK_IMAGE_EXISTS="false"
        export MOCK_PULL_FAIL_COUNT=5
        export CONTAINER_PULL_INITIAL_BACKOFF=0
        source "$PROJECT_ROOT/scripts/containers/container-common.sh"
        ENGINE="$engine"
        ensure_container_image "test-image:latest" "test-image"
    ) > "$stdout_log" 2> "$stderr_log"
    local exit_code=$?
    set -e

    local pull_count
    pull_count=$(grep -c "PULL: test-image:latest" "$MOCK_LOG" || true)

    if [ $exit_code -eq 1 ] && [ "$pull_count" -eq 3 ] && \
       grep -q "❌ Error: Failed to pull test-image after 3 attempts." "$stderr_log"; then
        echo "✓ PASSED"
        PASSED=$((PASSED + 1))
    else
        echo "✗ FAILED (exit: $exit_code, pulls: $pull_count, stderr: $(cat "$stderr_log" 2>/dev/null))"
        FAILED=$((FAILED + 1))
    fi
}
test_ensure_container_image_pull_exhausted_retries "podman"
test_ensure_container_image_pull_exhausted_retries "docker"

echo ""
echo "=== Test Results: $PASSED passed, $FAILED failed ==="

if [ $FAILED -gt 0 ]; then
    exit 1
fi
exit 0
