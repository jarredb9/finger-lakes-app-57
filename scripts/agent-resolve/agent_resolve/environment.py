"""
Autonomous Issue Resolver execution environment and secret sanitization utilities.
"""

from __future__ import annotations

from datetime import datetime, timezone
import os
from pathlib import Path
import re
import subprocess
import sys
from typing import Any, Sequence

from agent_resolve import config

SENSITIVE_ENV_KEYS: tuple[str, ...] = (
    "GEMINI_API_KEY",
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "APP_ID",
    "APP_PRIVATE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "GOOGLE_MAPS_API_KEY",
    "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
    "SUPABASE_DB_URL",
    "POSTGRES_PASSWORD",
    "JWT_SECRET",
    "VERCEL_TOKEN",
    "SUPABASE_ACCESS_TOKEN",
)

DOCKER_HOST_ENV_KEYS: tuple[str, ...] = (
    "PATH",
    "HOME",
    "USER",
    "DOCKER_HOST",
    "XDG_RUNTIME_DIR",
)

DEFAULT_SUPABASE_TEST_ENV: dict[str, str] = {
    "NEXT_PUBLIC_SUPABASE_URL": "http://127.0.0.1:54321",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": "test-anon-key",
    "SUPABASE_SERVICE_ROLE_KEY": "test-service-role-key",
}


def log(msg: str, file: Any = None) -> None:
    """Prints a timestamped message and flushes immediately to eliminate CI block buffering."""
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    target_file = file if file is not None else sys.stdout
    print(f"[{ts}] {msg}", file=target_file, flush=True)


def sanitize_secrets(text: str) -> str:
    """
    Redacts sensitive tokens, API keys, and authorization headers from strings
    to prevent credential leaks in logs, issue comments, PR bodies, and handoff docs.
    """
    if not text:
        return ""
    # Redact sensitive environment variables if present first
    redacted = text
    for key in SENSITIVE_ENV_KEYS:
        val = os.environ.get(key)
        if val and len(val) >= 6:
            redacted = redacted.replace(val, f"[REDACTED_{key}]")
    # GitHub personal access and installation tokens (ghp_, gho_, ghu_, ghs_, ghr_, github_pat_)
    redacted = re.sub(
        r"(?:gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{22,})",
        "[REDACTED_GH_TOKEN]",
        redacted,
    )
    # Google API Keys (AIza...)
    redacted = re.sub(r"AIza[0-9A-Za-z\-_]{35}", "[REDACTED_AIZA_KEY]", redacted)
    # Supabase access tokens (sbp_...)
    redacted = re.sub(r"sbp_[A-Za-z0-9_]{30,}", "[REDACTED_SUPABASE_TOKEN]", redacted)
    # Supabase secrets (sb_secret_...)
    redacted = re.sub(r"sb_secret_[A-Za-z0-9_\-]{20,}", "[REDACTED_SECRET]", redacted)
    # App Quality / Antigravity keys (AQ...)
    redacted = re.sub(r"AQ[A-Za-z0-9_\-]{20,}", "[REDACTED_AQ_KEY]", redacted)
    # PostgreSQL connection strings
    redacted = re.sub(r"postgresql://[^\s\"']+", "[REDACTED_DB_URL]", redacted)
    # Bearer authorization headers/tokens
    redacted = re.sub(r"Bearer\s+[A-Za-z0-9\-._~+/]+=*", "Bearer [REDACTED_TOKEN]", redacted)
    return redacted


def run_cmd(
    cmd: Sequence[str],
    cwd: Path | str | None = None,
    env: dict[str, str] | None = None,
    check: bool = False,
    timeout: int = 180,
) -> tuple[int, str, str]:
    """Runs a subprocess command with timeout and returns (exit_code, stdout, stderr)."""
    target_cwd = cwd if cwd is not None else config.get_project_root()
    if env is not None:
        exec_env = env
    else:
        exec_env = os.environ.copy()
        for k in SENSITIVE_ENV_KEYS:
            exec_env.pop(k, None)
        for k in list(exec_env.keys()):
            if k.startswith("AQ") or k.startswith("sb_secret_"):
                exec_env.pop(k, None)

    p = subprocess.Popen(
        list(cmd),
        cwd=str(target_cwd),
        env=exec_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        stdout, stderr = p.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        p.kill()
        stdout, stderr = p.communicate()
        err_msg = f"Command {' '.join(cmd)} timed out after {timeout} seconds."
        if check:
            raise TimeoutError(err_msg)
        return 124, (stdout or "").strip(), f"{(stderr or '').strip()}\n{err_msg}".strip()
    if check and p.returncode != 0:
        raise RuntimeError(f"Command {' '.join(cmd)} failed (code {p.returncode}):\n{stderr}\n{stdout}")
    return p.returncode, (stdout or "").strip(), (stderr or "").strip()


def is_docker_available() -> bool:
    """Checks whether Docker daemon is active and responsive."""
    try:
        res = subprocess.run(
            ["docker", "info"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=5,
        )
        return res.returncode == 0
    except Exception:
        return False


def run_isolated_test(
    cmd: Sequence[str],
    cwd: Path | str | None = None,
    timeout: int = 180,
) -> tuple[int, str, str]:
    """
    Runs verification commands within a hardened environment.
    If Docker is available, wraps inside an ephemeral container with --network none,
    matching UID/GID, read-only host mount (-v {target_root}:/app:ro), and tmpfs /tmp
    so tests cannot mutate host scripts, source, or .git.
    Otherwise falls back to subprocess with all credentials scrubbed.
    """
    target_root = config.get_project_root()
    target_cwd = cwd if cwd is not None else target_root
    if is_docker_available():
        uid = os.getuid() if hasattr(os, "getuid") else 1000
        gid = os.getgid() if hasattr(os, "getgid") else 1000
        docker_cmd = [
            "docker", "run", "--rm",
            "--network", "none",
            "--user", f"{uid}:{gid}",
            "-v", f"{target_root}:/app:ro",
            "--tmpfs", "/tmp:rw,exec,size=512m",
            "-w", "/app",
            "-e", "CI=true",
            "-e", "NODE_ENV=test",
            "-e", "HOME=/tmp",
            "-e", "npm_config_cache=/tmp/.npm",
            "-e", "TMPDIR=/tmp",
            "-e", "JEST_CACHE_DIR=/tmp/jest",
            "-e", "NO_UPDATE_NOTIFIER=1",
            "-e", "npm_config_audit=false",
        ] + [
            arg
            for k, v in DEFAULT_SUPABASE_TEST_ENV.items()
            for arg in ("-e", f"{k}={v}")
        ] + [
            "-e", "PATH=/app/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            "node:24-slim",
        ] + list(cmd)
        docker_host_env = {k: os.environ[k] for k in DOCKER_HOST_ENV_KEYS if k in os.environ}
        return run_cmd(docker_cmd, cwd=target_cwd, env=docker_host_env, check=False, timeout=timeout)

    if os.environ.get("CI") == "true":
        raise RuntimeError("Docker daemon is unavailable in CI. Un-sandboxed host test execution is forbidden.")
    log("Warning: Docker daemon is unavailable. Falling back to host subprocess execution with scrubbed environment.")

    isolated_env = os.environ.copy()
    for key in SENSITIVE_ENV_KEYS:
        isolated_env.pop(key, None)
    for k in list(isolated_env.keys()):
        if k.startswith("AQ") or k.startswith("sb_secret_"):
            isolated_env.pop(k, None)
    isolated_env.update(DEFAULT_SUPABASE_TEST_ENV)
    return run_cmd(list(cmd), cwd=target_cwd, env=isolated_env, check=False, timeout=timeout)


__all__: list[str] = [
    "DEFAULT_SUPABASE_TEST_ENV",
    "DOCKER_HOST_ENV_KEYS",
    "SENSITIVE_ENV_KEYS",
    "log",
    "sanitize_secrets",
    "run_cmd",
    "is_docker_available",
    "run_isolated_test",
]
