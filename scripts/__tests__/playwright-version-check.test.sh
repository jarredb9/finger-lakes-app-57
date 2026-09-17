#!/bin/bash

# scripts/__tests__/playwright-version-check.test.sh
# Purpose: Version canary test asserting @playwright/test and container scripts resolve to 1.63.0 / v1.63.0-noble.

set -u

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

PASSED=0
FAILED=0

assert_eq() {
    local test_name="$1"
    local expected="$2"
    local actual="$3"

    echo -n "Running test: $test_name... "
    if [ "$expected" = "$actual" ]; then
        echo "✓ PASSED"
        PASSED=$((PASSED + 1))
    else
        echo "✗ FAILED"
        echo "  Expected: $expected"
        echo "  Actual:   $actual"
        FAILED=$((FAILED + 1))
    fi
}

echo "=== Running Playwright Version Canary Tests (Phase 5 Task 1) ==="

# 1. package.json devDependencies
PKG_VERSION=$(node -e "
    try {
        const pkg = require('$PROJECT_ROOT/package.json');
        console.log(pkg.devDependencies?.['@playwright/test'] || '');
    } catch (e) {
        console.log('');
    }
")
assert_eq "package.json: @playwright/test is 1.63.0" "1.63.0" "$PKG_VERSION"

# 2. package-lock.json resolved version
LOCK_VERSION=$(node -e "
    try {
        const lock = require('$PROJECT_ROOT/package-lock.json');
        const pkg = lock.packages?.['node_modules/@playwright/test'] || lock.dependencies?.['@playwright/test'];
        console.log(pkg?.version || '');
    } catch (e) {
        console.log('');
    }
")
assert_eq "package-lock.json: @playwright/test resolves to 1.63.0" "1.63.0" "$LOCK_VERSION"

# 3. scripts/run-e2e-container.sh
E2E_VERSION=$(grep -E '^PLAYWRIGHT_VERSION=' "$PROJECT_ROOT/scripts/run-e2e-container.sh" | cut -d '=' -f2- | tr -d '\"')
assert_eq "scripts/run-e2e-container.sh: PLAYWRIGHT_VERSION is v1.63.0-noble" "v1.63.0-noble" "$E2E_VERSION"

# 4. scripts/run-jest-container.sh
JEST_VERSION=$(grep -E '^PLAYWRIGHT_VERSION=' "$PROJECT_ROOT/scripts/run-jest-container.sh" | cut -d '=' -f2- | tr -d '\"')
assert_eq "scripts/run-jest-container.sh: PLAYWRIGHT_VERSION is v1.63.0-noble" "v1.63.0-noble" "$JEST_VERSION"

# 5. scripts/run-dev-container.sh
DEV_VERSION=$(grep -E '^PLAYWRIGHT_VERSION=' "$PROJECT_ROOT/scripts/run-dev-container.sh" | cut -d '=' -f2- | tr -d '\"')
assert_eq "scripts/run-dev-container.sh: PLAYWRIGHT_VERSION is v1.63.0-noble" "v1.63.0-noble" "$DEV_VERSION"

# 6. scripts/run-build-container.sh
BUILD_VERSION=$(grep -E '^PLAYWRIGHT_VERSION=' "$PROJECT_ROOT/scripts/run-build-container.sh" | cut -d '=' -f2- | tr -d '\"')
assert_eq "scripts/run-build-container.sh: PLAYWRIGHT_VERSION is v1.63.0-noble" "v1.63.0-noble" "$BUILD_VERSION"

echo ""
echo "=== Test Results: $PASSED passed, $FAILED failed ==="

if [ $FAILED -gt 0 ]; then
    exit 1
fi
exit 0
