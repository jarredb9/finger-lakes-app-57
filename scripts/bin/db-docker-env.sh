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

# 2. Portably restore SELinux context via container-common.sh if present
# Silently no-ops on macOS, Ubuntu, Debian, or non-SELinux environments
if [ -f "$PROJECT_ROOT/scripts/containers/container-common.sh" ]; then
    # shellcheck source=../containers/container-common.sh
    source "$PROJECT_ROOT/scripts/containers/container-common.sh"
    restore_supabase_selinux
fi

# 3. Detect container engine & configure DOCKER_HOST portably
# If DOCKER_HOST is not explicitly set, determine container runtime
if [ -z "${DOCKER_HOST:-}" ]; then
    if [ "${CONTAINER_ENGINE:-}" = "docker" ] || ([ -z "${CONTAINER_ENGINE:-}" ] && command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1); then
        # Standard Docker daemon is active and responsive; leave DOCKER_HOST unset
        :
    elif [ "${CONTAINER_ENGINE:-}" = "podman" ] || command -v podman >/dev/null 2>&1; then
        UID_NUM="$(id -u 2>/dev/null || echo 1000)"
        PODMAN_SOCK="/run/user/$UID_NUM/podman/podman.sock"
        if [ -S "$PODMAN_SOCK" ]; then
            export DOCKER_HOST="unix://$PODMAN_SOCK"
        fi
    fi
fi

# Helper: Extract clean variable value from .env.local or .env
get_env_val() {
    local key="$1"
    grep -E "^${key}=" "$PROJECT_ROOT/.env.local" "$PROJECT_ROOT/.env" 2>/dev/null | head -n 1 | cut -d '=' -f2- | tr -d '"'\r || true
}

# 4. Dispatch subcommands or execute arbitrary arguments
cd "$PROJECT_ROOT"

case "${1:-}" in
    start)
        shift
        # Extract API keys if present
        GOOGLE_MAPS_KEY="$(get_env_val "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY")"
        if [ -n "$GOOGLE_MAPS_KEY" ]; then
            export GOOGLE_MAPS_API_KEY="$GOOGLE_MAPS_KEY"
        fi

        GEMINI_KEY="$(get_env_val "GEMINI_API_KEY")"
        if [ -n "$GEMINI_KEY" ]; then
            export GEMINI_API_KEY="$GEMINI_KEY"
            if [ -f "./supabase/functions/.env" ]; then
                TMP_ENV="$(mktemp ./supabase/functions/.env.tmp.XXXXXX 2>/dev/null || mktemp /tmp/supabase-env.XXXXXX)"
                if sed "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=$GEMINI_KEY|" ./supabase/functions/.env > "$TMP_ENV" 2>/dev/null; then
                    mv "$TMP_ENV" ./supabase/functions/.env
                else
                    rm -f "$TMP_ENV"
                fi
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
        npx tsx scripts/db/lint-migrations.ts
        exec npx supabase db lint --level error --schema public "$@"
        ;;
    verify-advisor)
        shift
        exec npx tsx scripts/db/verify-security-advisor.ts "$@"
        ;;
    check-types:local)
        shift
        TMP_FILE="lib/database.types.tmp.ts"
        trap 'rm -f "$TMP_FILE"' EXIT INT TERM
        npx supabase gen types typescript --schema public > "$TMP_FILE"
        diff lib/database.types.ts "$TMP_FILE"
        ;;
    gen-types)
        shift
        exec npx supabase gen types typescript --schema public > lib/database.types.ts
        ;;
    *)
        exec "$@"
        ;;
esac
