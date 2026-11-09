#!/bin/bash

# scripts/containers/container-common.sh
# Purpose: Shared container configuration, engine detection, rootless pre-flight checks,
# and common options for container runner scripts (RHEL 8 / glibc < 2.29 compatibility).

# 1. Canonical Image Configuration
PLAYWRIGHT_VERSION="v1.64.1-noble"
IMAGE="mcr.microsoft.com/playwright:$PLAYWRIGHT_VERSION"

# Project root resolution (supports execution from scripts/ or scripts/containers/)
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../../package.json" ]; then
    CONTAINER_PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
else
    CONTAINER_PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

# Detect container engine (honor CONTAINER_ENGINE env var, prefer docker in CI, fallback to podman locally)
detect_container_engine() {
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
}

# Pre-flight check: Verify container engine can run in the current environment
check_container_environment() {
    local engine="${1:-$ENGINE}"
    if [ "$engine" = "podman" ]; then
        if ! podman unshare true >/dev/null 2>&1 || ! mkdir -p "${XDG_DATA_HOME:-$HOME/.local/share}/containers" 2>/dev/null; then
            echo "❌ Error: Podman cannot run rootless containers in this restricted environment." >&2
            echo "   (Detected restricted sandbox: missing /run, disabled user namespaces, or read-only ~/.local/share)" >&2
            echo "👉 If running via an AI agent, re-run this command with 'BypassSandbox: true'." >&2
            exit 1
        fi
    fi
}

# Configure engine-specific arguments
setup_container_engine() {
    detect_container_engine
    check_container_environment "$ENGINE"

    EXTRA_OPTS=()
    if [ "$ENGINE" = "podman" ]; then
        EXTRA_OPTS+=( "--userns=keep-id" )
    else
        EXTRA_OPTS+=( "--user" "$(id -u):$(id -g)" )
    fi
    EXTRA_OPTS+=( "-e" "HOME=/tmp" )
}

# Ensure container image exists locally or pull it with exponential backoff retry (2s, 4s, 8s)
ensure_container_image() {
    local target_image="${1:-$IMAGE}"
    local label="${2:-image $target_image}"

    if [ -z "${ENGINE:-}" ]; then
        detect_container_engine
    fi

    # Fast path: zero network if image already exists locally
    if [ "$ENGINE" = "podman" ]; then
        if podman image exists "$target_image"; then
            return 0
        fi
    else
        if docker image inspect "$target_image" >/dev/null 2>&1; then
            return 0
        fi
    fi

    local max_attempts="${CONTAINER_PULL_MAX_ATTEMPTS:-3}"
    local backoff="${CONTAINER_PULL_INITIAL_BACKOFF:-2}"
    local attempt=1

    while [ "$attempt" -le "$max_attempts" ]; do
        echo "📥 Pulling $label (attempt $attempt/$max_attempts)..."
        local pull_status=0
        if [ "$ENGINE" = "podman" ]; then
            podman pull "$target_image" || pull_status=$?
        else
            docker pull "$target_image" || pull_status=$?
        fi

        if [ $pull_status -eq 0 ]; then
            return 0
        fi

        if [ "$attempt" -lt "$max_attempts" ]; then
            echo "⚠️  Pull failed for $label (attempt $attempt/$max_attempts). Retrying in ${backoff}s..." >&2
            if [ "$backoff" -gt 0 ]; then
                sleep "$backoff"
            fi
            backoff=$((backoff * 2))
            attempt=$((attempt + 1))
        else
            echo "❌ Error: Failed to pull $label after $max_attempts attempts." >&2
            return 1
        fi
    done

    return 1
}

# Restore SELinux security context on supabase/functions directory
# Prevents Edge Runtime 503 BOOT_ERROR caused by :Z volume mounts
restore_supabase_selinux() {
    local target_dir="$CONTAINER_PROJECT_ROOT/supabase/functions"
    if [ -d "$target_dir" ]; then
        if command -v restorecon >/dev/null 2>&1; then
            restorecon -RF "$target_dir" >/dev/null 2>&1 || true
        elif [ -x /sbin/restorecon ]; then
            /sbin/restorecon -RF "$target_dir" >/dev/null 2>&1 || true
        elif [ -x /usr/sbin/restorecon ]; then
            /usr/sbin/restorecon -RF "$target_dir" >/dev/null 2>&1 || true
        fi
    fi
}
