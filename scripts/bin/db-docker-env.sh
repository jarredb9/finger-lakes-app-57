#!/bin/bash
# scripts/bin/db-docker-env.sh
# Purpose: Multi-platform environment wrapper for Supabase CLI and local database scripts.
# Handles PATH prepending, SELinux context restoration (if available), and portable Docker/Podman socket detection.

set -e

# Resolve project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 1. Ensure scripts/bin is in PATH for podman compatibility shim
if [ -d "$PROJECT_ROOT/scripts/bin" ]; then
    case ":$PATH:" in
        *":$PROJECT_ROOT/scripts/bin:"*) ;;
        *) export PATH="$PROJECT_ROOT/scripts/bin:$PATH" ;;
    esac
fi

# 2. Portably restore SELinux context if restorecon exists (RHEL/CentOS/Fedora)
# Silently no-ops on macOS, Ubuntu, Debian, or non-SELinux environments
restore_selinux() {
    local target_dir="$PROJECT_ROOT/supabase/functions"
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
restore_selinux

# 3. Detect container engine & configure DOCKER_HOST portably
# If DOCKER_HOST is not already set, check for rootless Podman socket
if [ -z "${DOCKER_HOST:-}" ]; then
    UID_NUM="$(id -u 2>/dev/null || echo 1000)"
    PODMAN_SOCK="/run/user/$UID_NUM/podman/podman.sock"
    if [ -S "$PODMAN_SOCK" ]; then
        export DOCKER_HOST="unix://$PODMAN_SOCK"
    fi
fi

# 4. Dispatch subcommands or execute arbitrary arguments
cd "$PROJECT_ROOT"

case "${1:-}" in
    start)
        shift
        # Extract API keys if present in .env.local or .env
        GOOGLE_MAPS_KEY="$(grep NEXT_PUBLIC_GOOGLE_MAPS_API_KEY .env.local .env 2>/dev/null | head -n 1 | cut -d '=' -f2- | tr -d '"'\r || true)"
        if [ -n "$GOOGLE_MAPS_KEY" ]; then
            export GOOGLE_MAPS_API_KEY="$GOOGLE_MAPS_KEY"
        fi

        GEMINI_KEY="$(grep -E '^GEMINI_API_KEY=' .env.local .env 2>/dev/null | head -n 1 | cut -d '=' -f2- | tr -d '"'\r || true)"
        if [ -n "$GEMINI_KEY" ]; then
            export GEMINI_API_KEY="$GEMINI_KEY"
            if [ -f "./supabase/functions/.env" ]; then
                sed -i "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=$GEMINI_KEY|" ./supabase/functions/.env 2>/dev/null || true
            fi
        fi
        exec npx supabase start "$@"
        ;;
    stop)
        shift
        exec npx supabase stop "$@"
        ;;
    reset)
        shift
        exec npx supabase db reset "$@"
        ;;
    status)
        shift
        exec npx supabase status "$@"
        ;;
    lint)
        shift
        exec npx supabase db lint --level error --schema public "$@"
        ;;
    verify-advisor)
        shift
        exec npx tsx scripts/db/verify-security-advisor.ts "$@"
        ;;
    check-types:local)
        shift
        npx supabase gen types typescript --schema public > lib/database.types.tmp.ts
        diff lib/database.types.ts lib/database.types.tmp.ts
        rm -f lib/database.types.tmp.ts
        ;;
    gen-types)
        shift
        exec npx supabase gen types typescript --schema public > lib/database.types.ts
        ;;
    *)
        exec "$@"
        ;;
esac
