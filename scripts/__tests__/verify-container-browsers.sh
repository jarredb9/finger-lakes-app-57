#!/bin/bash

# scripts/__tests__/verify-container-browsers.sh
# Purpose: Certify Playwright browser engines (chromium, webkit, Mobile Safari, firefox) inside Noble container on RHEL 8 rootless Podman.

set -euo pipefail

PLAYWRIGHT_VERSION="v1.63.0-noble"
IMAGE="mcr.microsoft.com/playwright:$PLAYWRIGHT_VERSION"

echo "=== Certifying Container Browser Engines ($IMAGE) ==="

# Detect container engine
if [ -n "${CONTAINER_ENGINE:-}" ]; then
    ENGINE="$CONTAINER_ENGINE"
elif [ "${CI:-}" = "true" ] && command -v docker >/dev/null 2>&1; then
    ENGINE="docker"
elif command -v podman >/dev/null 2>&1; then
    ENGINE="podman"
elif command -v docker >/dev/null 2>&1; then
    ENGINE="docker"
else
    echo "❌ Error: Neither podman nor docker was found on this system." >&2
    exit 1
fi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

EXTRA_OPTS=()
if [ "$ENGINE" = "podman" ]; then
    EXTRA_OPTS+=( "--userns=keep-id" )
else
    EXTRA_OPTS+=( "--user" "$(id -u):$(id -g)" )
fi

$ENGINE run --rm \
    --network=host \
    -v "$PROJECT_ROOT:/work:Z" \
    -w /work \
    "${EXTRA_OPTS[@]}" \
    --security-opt label=disable \
    --security-opt seccomp=unconfined \
    "$IMAGE" \
    node -e "
const { chromium, webkit, firefox, devices } = require('playwright');

async function testEngine(name, launcher, options = {}) {
    process.stdout.write('Testing ' + name + '... ');
    const browser = await launcher.launch({ headless: true });
    const context = await browser.newContext(options);
    const page = await context.newPage();
    await page.setContent('<html><body><h1>Engine OK</h1></body></html>');
    const text = await page.textContent('h1');
    if (text !== 'Engine OK') {
        throw new Error('Failed content assertion for ' + name);
    }
    console.log('✓ PASSED (v' + browser.version() + ')');
    await browser.close();
}

(async () => {
    try {
        await testEngine('Chromium', chromium);
        await testEngine('WebKit', webkit);
        await testEngine('Mobile Safari', webkit, devices['iPhone 12']);
        await testEngine('Firefox', firefox);
        console.log('=== All Browser Engines Certified Successfully ===');
    } catch (err) {
        console.error('✗ Engine certification failed:', err);
        process.exit(1);
    }
})();
"
