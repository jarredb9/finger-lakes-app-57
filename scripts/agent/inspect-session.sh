#!/usr/bin/env bash
set -euo pipefail

# Session Inspector Wrapper for Antigravity-CLI
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "${SCRIPT_DIR}/inspect-session.mjs" "$@"
