#!/usr/bin/env python3
"""
Autonomous Issue Resolver Harness for GitHub Actions and Scheduled Nightly Runs.

Orchestrates multi-stage TDD resolution for triaged GitHub issues:
  Stage 1: Architectural Blueprint (gemini-3.8-flash) -> task-plan.md
  Stage 2: Red Phase Executor (gemini-3.8-flash) -> failing test suites with compiler self-healing
  Stage 3: Green Phase Executor (gemini-3.8-flash) -> search/replace patching + full regression gate

Enforces state-of-the-art autonomous agent best practices:
  - Provenance check: Issue must be authored by verified repository maintainer (jarredb9)
  - Hard-stop model policy: Standardized strictly on gemini-3.8-flash (no downgrades)
  - Ephemeral test isolation: Docker container with --network none and UID matching
  - Secret protection: actions/checkout persist-credentials: false & env scrubbing
  - Precision modifications: Pydantic PatchManifest search/replace engine (no whole-file rewrites)
  - TDD compiler gates: Red tests must compile (type-check clean) and fail; Green must pass full suite
  - Downstream CI triggering: GitHub App token minting with automatic ci.yml triggering
  - Git workspace isolation: Clean main resets between issues and on failure
"""

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
import random
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Type, TypeVar

try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(line_buffering=True)
except Exception:
    pass


def log(msg: str, file=None) -> None:
    """Prints a timestamped message and flushes immediately to eliminate CI block buffering."""
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    target_file = file or sys.stdout
    print(f"[{ts}] {msg}", file=target_file, flush=True)


from pydantic import BaseModel, Field

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Canonical model configuration with strict hard-stop (no fallback downgrades)
DEFAULT_PLANNER_MODELS = [
    os.environ.get("PLANNER_MODEL", "gemini-3.8-flash"),
]
DEFAULT_EXECUTOR_MODELS = [
    os.environ.get("EXECUTOR_MODEL", "gemini-3.8-flash"),
]

# Token limits & safeguards
MAX_TOKENS_PER_ISSUE = int(os.environ.get("MAX_TOKENS_PER_ISSUE", "500000"))
BATCH_PACING_SECONDS = int(os.environ.get("BATCH_PACING_SECONDS", "5"))

T = TypeVar("T", bound=BaseModel)


# =========================================================================
# OBSERVABILITY & METRICS
# =========================================================================
@dataclass
class TokenTracker:
    prompt_tokens: int = 0
    candidate_tokens: int = 0
    total_tokens: int = 0
    cached_tokens: int = 0
    call_count: int = 0

    def record_usage(self, usage_metadata: Any) -> None:
        if not usage_metadata:
            return
        p_tokens = getattr(usage_metadata, "prompt_token_count", 0) or 0
        c_tokens = getattr(usage_metadata, "candidates_token_count", 0) or 0
        t_tokens = getattr(usage_metadata, "total_token_count", 0) or 0
        cached = getattr(usage_metadata, "cached_content_token_count", 0) or 0

        self.prompt_tokens += p_tokens
        self.candidate_tokens += c_tokens
        self.total_tokens += t_tokens
        self.cached_tokens += cached
        self.call_count += 1

        if self.total_tokens > MAX_TOKENS_PER_ISSUE:
            raise RuntimeError(
                f"Token budget exceeded: {self.total_tokens:,} tokens used (limit: {MAX_TOKENS_PER_ISSUE:,})"
            )

    def summary(self) -> str:
        return (
            f"{self.total_tokens:,} total tokens "
            f"({self.prompt_tokens:,} prompt, {self.candidate_tokens:,} candidates, "
            f"{self.cached_tokens:,} cached) across {self.call_count} API call(s)"
        )


# =========================================================================
# STRUCTURED DATA SCHEMAS (PYDANTIC)
# =========================================================================
class DiagnosticAction(BaseModel):
    action: str = Field(description="Action to execute: 'grep_search', 'find_files', 'read_file_snippet', or 'conclude'")
    query: str = Field(default="", description="Search query string for grep_search (function name, UI text, error string)")
    path_prefix: str = Field(default="", description="Optional directory path prefix for grep_search (e.g. 'lib/', 'components/')")
    pattern: str = Field(default="", description="File name glob or keyword for find_files (e.g. '*nav*', '*card*')")
    file_path: str = Field(default="", description="Repository-relative file path for read_file_snippet")
    start_line: int = Field(default=1, description="1-indexed starting line number for read_file_snippet")
    end_line: int = Field(default=80, description="1-indexed ending line number for read_file_snippet")
    discovered_target_files: List[str] = Field(default_factory=list, description="Target source files verified or strongly suspected")
    reasoning: str = Field(description="Architectural rationale explaining why this tool is called or concluding findings")


class BlueprintPlan(BaseModel):
    scope: str = Field(description="Conventional commit scope, e.g. winery, trip, geo, ui")
    target_test_files: List[str] = Field(description="Explicit list of unit or component test file paths to create or modify")
    target_src_files: List[str] = Field(description="Explicit list of application source file paths to create or modify")
    plan_markdown: str = Field(description="Full markdown content for task-plan.md")


class TestFileEntry(BaseModel):
    file_path: str = Field(description="Repository-relative test file path, e.g. lib/utils/__tests__/map-utils.test.ts")
    content: str = Field(description="Complete test file content")


class SourceStubEntry(BaseModel):
    file_path: str = Field(description="Repository-relative new source file path to stub")
    content: str = Field(description="Minimal TypeScript type declarations and function stubs throwing 'Not implemented'")


class TestFileManifest(BaseModel):
    files: List[TestFileEntry] = Field(description="List of test files to create or overwrite")
    source_stubs: List[SourceStubEntry] = Field(
        default_factory=list,
        description="Minimal stubs for brand new source files that do not yet exist on disk",
    )


class PatchChunk(BaseModel):
    file_path: str = Field(description="Repository-relative path of the target source file")
    search_block: str = Field(
        description="Exact character sequence in the existing file to find and replace. Leave empty ONLY if creating a brand new source file."
    )
    replace_block: str = Field(
        description="Exact replacement code to insert in place of search_block."
    )


class PatchManifest(BaseModel):
    patches: List[PatchChunk] = Field(description="Ordered list of search/replace patch chunks to apply")


# =========================================================================
# SUBPROCESS & GIT UTILITIES
# =========================================================================
def sanitize_secrets(text: str) -> str:
    """
    Redacts sensitive tokens, API keys, and authorization headers from strings
    to prevent credential leaks in logs, issue comments, PR bodies, and handoff docs.
    """
    if not text:
        return ""
    # GitHub personal access and installation tokens (ghp_, gho_, ghu_, ghs_, ghr_, github_pat_)
    redacted = re.sub(r"(?:gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{22,})", "[REDACTED_GH_TOKEN]", text)
    # Google API Keys (AIza...)
    redacted = re.sub(r"AIza[0-9A-Za-z\-_]{35}", "[REDACTED_AIZA_KEY]", redacted)
    # Bearer authorization headers/tokens
    redacted = re.sub(r"Bearer\s+[A-Za-z0-9\-._~+/]+=*", "Bearer [REDACTED_TOKEN]", redacted)
    # Redact sensitive environment variables if present
    sensitive_keys = [
        "GEMINI_API_KEY",
        "GH_TOKEN",
        "GITHUB_TOKEN",
        "APP_ID",
        "APP_PRIVATE_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "GOOGLE_MAPS_API_KEY",
    ]
    for key in sensitive_keys:
        val = os.environ.get(key)
        if val and len(val) >= 6:
            redacted = redacted.replace(val, f"[REDACTED_{key}]")
    return redacted


def run_cmd(
    cmd: List[str],
    cwd: Optional[Path] = None,
    env: Optional[Dict[str, str]] = None,
    check: bool = False,
    timeout: int = 180,
) -> Tuple[int, str, str]:
    """Runs a subprocess command with timeout and returns (exit_code, stdout, stderr)."""
    p = subprocess.Popen(
        cmd,
        cwd=str(cwd or PROJECT_ROOT),
        env=env if env is not None else os.environ.copy(),
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
    return p.returncode, stdout.strip(), stderr.strip()


def is_docker_available() -> bool:
    """Checks whether Docker daemon is active and responsive."""
    try:
        res = subprocess.run(["docker", "info"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
        return res.returncode == 0
    except Exception:
        return False


def run_isolated_test(cmd: List[str], cwd: Optional[Path] = None, timeout: int = 180) -> Tuple[int, str, str]:
    """
    Runs verification commands within a hardened environment.
    If Docker is available, wraps inside an ephemeral container with --network none,
    matching UID/GID, read-only host mount (-v {PROJECT_ROOT}:/app:ro), and tmpfs /tmp
    so tests cannot mutate host scripts, source, or .git.
    Otherwise falls back to subprocess with all credentials scrubbed.
    """
    target_cwd = cwd or PROJECT_ROOT
    if is_docker_available():
        uid = os.getuid()
        gid = os.getgid()
        docker_cmd = [
            "docker", "run", "--rm",
            "--network", "none",
            "--user", f"{uid}:{gid}",
            "-v", f"{PROJECT_ROOT}:/app:ro",
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
            "-e", "PATH=/app/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            "node:24-slim",
        ] + cmd
        return run_cmd(docker_cmd, cwd=target_cwd, env={}, check=False, timeout=timeout)

    isolated_env = os.environ.copy()
    sensitive_keys = [
        "GEMINI_API_KEY",
        "GH_TOKEN",
        "GITHUB_TOKEN",
        "APP_ID",
        "APP_PRIVATE_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "GOOGLE_MAPS_API_KEY",
    ]
    for key in sensitive_keys:
        isolated_env.pop(key, None)
    return run_cmd(cmd, cwd=target_cwd, env=isolated_env, check=False, timeout=timeout)


def gh_cli(args: List[str], timeout: int = 180) -> Tuple[int, str, str]:
    """Executes a GitHub CLI command with secret sanitization on all arguments."""
    sanitized_args = [sanitize_secrets(arg) if isinstance(arg, str) else arg for arg in args]
    return run_cmd(["gh"] + sanitized_args, timeout=timeout)


def reset_working_tree_to_main() -> None:
    """Discards uncommitted changes, untracked files, and checks out main cleanly (preserving diagnostic-artifacts/)."""
    tp = PROJECT_ROOT / "task-plan.md"
    if tp.exists():
        tp.unlink()
    run_cmd(["git", "reset", "--hard", "HEAD"])
    run_cmd(["git", "clean", "-fd", "-e", "diagnostic-artifacts"])
    run_cmd(["git", "checkout", "main"])
    code, _, _ = run_cmd(["git", "rev-parse", "--verify", "origin/main"])
    if code == 0:
        run_cmd(["git", "reset", "--hard", "origin/main"])


def cleanup_feature_branch(branch_name: str) -> None:
    """Cleans up local feature branch, scrubs untracked files, and reverts working tree to main."""
    tp = PROJECT_ROOT / "task-plan.md"
    if tp.exists():
        tp.unlink()
    run_cmd(["git", "reset", "--hard", "HEAD"])
    run_cmd(["git", "clean", "-fd", "-e", "diagnostic-artifacts"])
    run_cmd(["git", "checkout", "main"])
    code, _, _ = run_cmd(["git", "rev-parse", "--verify", "origin/main"])
    if code == 0:
        run_cmd(["git", "reset", "--hard", "origin/main"])
    run_cmd(["git", "branch", "-D", branch_name])


def safe_resolve_repo_path(rel_path_str: str) -> Path:
    """Validates that target file path stays strictly within the repository tree."""
    normalized = Path(rel_path_str).as_posix().lstrip("./")
    target = (PROJECT_ROOT / normalized).resolve()
    if not str(target).startswith(str(PROJECT_ROOT)):
        raise ValueError(f"Path traversal attempt blocked: {rel_path_str}")

    protected = [
        ".git",
        ".github/workflows",
        "scripts/agent-resolve.py",
        "supabase/migrations",
    ]
    for prot in protected:
        if normalized == prot or normalized.startswith(prot + "/"):
            raise ValueError(f"Modification of protected file blocked: {rel_path_str}")

    return target


def reset_target_sources(target_src: List[str], baseline_ref: str = "HEAD") -> None:
    """Resets target source files back to baseline_ref (reverting edits or removing newly created files)."""
    files_in_ref: List[str] = []
    for sf in target_src:
        try:
            p = safe_resolve_repo_path(sf)
        except Exception:
            continue
        code, _, _ = run_cmd(["git", "cat-file", "-e", f"{baseline_ref}:{sf}"])
        if code == 0:
            files_in_ref.append(sf)
        else:
            if p.exists():
                p.unlink()
    if files_in_ref:
        run_cmd(["git", "checkout", baseline_ref, "--"] + files_in_ref)


def apply_patch_manifest(
    manifest: PatchManifest,
    new_src_files: Optional[List[str]] = None,
) -> Tuple[bool, List[str]]:
    """
    Applies search/replace patches to target source files using a resilient two-tier engine:
      Tier 1: Exact character sequence match.
      Tier 2: Line-by-line whitespace-trimmed fallback matching (must match uniquely).
    Validates that each search_block resolves to exactly one occurrence in the target file.
    If all patches pass validation, applies changes atomically.
    Returns (success, error_diagnostics).
    """
    errors: List[str] = []
    staged_edits: Dict[Path, str] = {}

    for idx, patch in enumerate(manifest.patches, 1):
        try:
            target_path = safe_resolve_repo_path(patch.file_path)
        except Exception as e:
            errors.append(f"Patch #{idx} invalid file path: {e}")
            continue

        current_content = staged_edits.get(target_path)
        if current_content is None:
            if target_path.exists():
                current_content = target_path.read_text(encoding="utf-8")
            else:
                current_content = None

        # Normalize line endings to LF
        search_block = patch.search_block.replace("\r\n", "\n")
        replace_block = patch.replace_block.replace("\r\n", "\n")
        if current_content is not None:
            current_content = current_content.replace("\r\n", "\n")

        # Case 1: Creating a brand new file (or replacing stub of a new file)
        if not search_block:
            is_new = bool(new_src_files and patch.file_path in new_src_files)
            if current_content is not None and target_path.exists() and not is_new:
                errors.append(
                    f"Patch #{idx} specifies empty search_block for '{patch.file_path}', but the file already exists. "
                    "Empty search_block is only allowed when creating brand new files."
                )
                continue
            staged_edits[target_path] = replace_block
            continue

        # Case 2: Modifying an existing file
        if current_content is None:
            errors.append(
                f"Patch #{idx} specifies non-empty search_block for '{patch.file_path}', but the file does not exist on disk."
            )
            continue

        # Tier 1: Exact substring match
        occurrences = current_content.count(search_block)
        if occurrences == 1:
            new_content = current_content.replace(search_block, replace_block, 1)
            staged_edits[target_path] = new_content
            continue
        elif occurrences > 1:
            errors.append(
                f"Patch #{idx} for '{patch.file_path}': search_block matched {occurrences} exact locations. "
                "Include additional surrounding context lines to disambiguate the search block."
            )
            continue

        # Tier 2: Line-by-line whitespace-trimmed fallback matching
        search_lines = search_block.splitlines()
        file_lines = current_content.splitlines(keepends=True)
        file_lines_raw = current_content.splitlines()

        search_stripped = [l.strip() for l in search_lines]
        file_lines_stripped = [l.strip() for l in file_lines_raw]

        k = len(search_stripped)
        matches = []
        if k > 0 and k <= len(file_lines_stripped):
            for i in range(len(file_lines_stripped) - k + 1):
                if file_lines_stripped[i : i + k] == search_stripped:
                    matches.append(i)

        if len(matches) == 1:
            start_line = matches[0]
            end_line = start_line + k
            before = "".join(file_lines[:start_line])
            after = "".join(file_lines[end_line:])
            orig_block = "".join(file_lines[start_line:end_line])
            trailing_nl = "\n" if orig_block.endswith("\n") and not replace_block.endswith("\n") else ""
            new_content = before + replace_block + trailing_nl + after
            staged_edits[target_path] = new_content
            log(f"Patch #{idx} for '{patch.file_path}' applied via Tier 2 whitespace-trimmed match at lines {start_line+1}-{end_line}.")
            continue
        elif len(matches) > 1:
            errors.append(
                f"Patch #{idx} for '{patch.file_path}': search_block matched {len(matches)} locations using whitespace-insensitive matching. "
                "Include additional surrounding context lines to uniquely identify the replacement site."
            )
            continue

        # Not found in either Tier 1 or Tier 2
        lines = current_content.splitlines()
        sample_lines = "\n".join(lines[:30])
        errors.append(
            f"Patch #{idx} for '{patch.file_path}': search_block NOT FOUND in file (tested exact and whitespace-trimmed).\n"
            f"Search block attempted:\n```\n{search_block}\n```\n"
            f"Target file snippet for context reference:\n```\n{sample_lines}\n```"
        )

    if errors:
        return False, errors

    for path, content in staged_edits.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    return True, []


# =========================================================================
# GENAI CLIENT & RESILIENT INVOCATION
# =========================================================================
def get_genai_client():
    """Initializes and returns Google GenAI client with SDK-level transport retry options."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable is missing.")

    try:
        from google import genai
        from google.genai import types

        try:
            http_options = types.HttpOptions(
                retry_options=types.HttpRetryOptions(
                    attempts=5,
                    initial_delay=2.0,
                    max_delay=60.0,
                    http_status_codes=[408, 429, 500, 502, 503, 504],
                )
            )
            return genai.Client(api_key=api_key, http_options=http_options)
        except Exception:
            return genai.Client(api_key=api_key)
    except ImportError:
        raise ImportError(
            "The 'google-genai' package is required. Install with: pip install google-genai"
        )


def is_transient_error(err: Exception) -> bool:
    """Identifies transient rate limits, server errors, and socket/transport disconnects eligible for backoff retry."""
    err_str = str(err).upper()
    transient_indicators = [
        "429",
        "RESOURCE_EXHAUSTED",
        "RATE_LIMIT",
        "RATE LIMIT",
        "QUOTA",
        "500",
        "502",
        "503",
        "504",
        "UNAVAILABLE",
        "OVERLOADED",
        "DEADLINE_EXCEEDED",
        "SERVER DISCONNECTED",
        "CONNECTION RESET",
        "REMOTEDISCONNECTED",
        "REMOTE DISCONNECTED",
        "BROKEN PIPE",
        "BROKENPIPEERROR",
        "CONNECTION TIMED OUT",
        "CONNECTTIMEOUT",
        "READTIMEOUT",
        "TIMEOUT",
        "PROTOCOLERROR",
        "FETCHERROR",
        "NETWORK ERROR",
        "SOCKET",
        "EOF OCCURRED",
    ]
    return any(indicator in err_str for indicator in transient_indicators)


def call_gemini_with_fallback(
    client: Any,
    contents: str,
    models: List[str],
    schema_cls: Optional[Type[T]] = None,
    temperature: float = 0.2,
    token_tracker: Optional[TokenTracker] = None,
    max_retries_per_model: int = 3,
) -> Any:
    """
    Calls Gemini API with exponential backoff + randomized jitter for rate limits (429/503),
    strict hard-stop on error (no model downgrade fallback), and Pydantic validation.
    """
    from google.genai import types

    last_err: Optional[Exception] = None

    for model_name in models:
        for attempt in range(1, max_retries_per_model + 1):
            try:
                config = types.GenerateContentConfig(
                    temperature=temperature,
                )
                if schema_cls:
                    config.response_mime_type = "application/json"
                    config.response_schema = schema_cls

                response = client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=config,
                )

                if token_tracker and hasattr(response, "usage_metadata"):
                    token_tracker.record_usage(response.usage_metadata)

                if schema_cls:
                    if hasattr(response, "parsed") and response.parsed is not None:
                        return response.parsed
                    if response and response.text:
                        clean_text = re.sub(r"^```(?:json)?\s*", "", response.text.strip())
                        clean_text = re.sub(r"\s*```$", "", clean_text.strip())
                        return schema_cls.model_validate_json(clean_text)
                    raise ValueError(f"Empty structured response received from model {model_name}")

                if response and response.text:
                    return response.text

                raise ValueError(f"Empty text response received from model {model_name}")

            except Exception as e:
                last_err = e
                if is_transient_error(e) and attempt < max_retries_per_model:
                    base_delay = 2.0 * (2 ** (attempt - 1))
                    jitter = random.uniform(0.5, 1.5)
                    delay = min(60.0, base_delay + jitter)
                    print(
                        f"Transient rate limit / capacity error on {model_name} (attempt {attempt}/{max_retries_per_model}). "
                        f"Backing off for {delay:.2f}s... (Error: {e})",
                        file=sys.stderr,
                    )
                    time.sleep(delay)
                    continue

                print(
                    f"Error: Model {model_name} failed on attempt {attempt}: {e}.",
                    file=sys.stderr,
                )
                break

    raise RuntimeError(f"API call to model {models[0]} failed. Last error: {last_err}")


def get_repository_tree() -> str:
    """Extracts a compact inventory of existing repository source files to anchor architectural planning."""
    code, stdout, _ = run_cmd(["git", "ls-files", "lib/", "components/", "app/", "supabase/functions/"])
    if code != 0 or not stdout:
        return ""
    relevant_exts = (".ts", ".tsx", ".js", ".jsx", ".sql", ".json")
    files = [f for f in stdout.splitlines() if f.endswith(relevant_exts)]
    return "### EXISTING REPOSITORY SOURCE FILES:\n" + "\n".join(f"- {f}" for f in files)


def get_project_context() -> str:
    """Extracts essential project standards, architecture guidelines, and repository file inventory."""
    context_md = ""
    agents_md = ""

    c_path = PROJECT_ROOT / "CONTEXT.md"
    if c_path.exists():
        context_md = c_path.read_text(encoding="utf-8")

    a_path = PROJECT_ROOT / "AGENTS.md"
    if a_path.exists():
        agents_md = a_path.read_text(encoding="utf-8")

    repo_tree = get_repository_tree()

    return f"""### REPOSITORY DOMAIN MODEL (CONTEXT.md):
{context_md}

### ARCHITECTURAL RULES & STANDARDS (AGENTS.md):
{agents_md}

{repo_tree}
"""


# =========================================================================
# READ-ONLY REPOSITORY EXPLORATION TOOLS
# =========================================================================
def grep_search(query: str, path_prefix: str = "") -> str:
    """Searches text across repository files using git grep."""
    q = query.strip()
    if not q:
        return "No search query provided."
    cmd = ["git", "grep", "-n", "-I", "-F", "-e", q]
    if path_prefix.strip():
        norm_prefix = path_prefix.strip().lstrip("./")
        cmd.extend(["--", norm_prefix])
    code, stdout, _ = run_cmd(cmd)
    if code != 0 or not stdout.strip():
        # Case-insensitive fallback
        cmd_i = ["git", "grep", "-n", "-I", "-i", "-F", "-e", q]
        if path_prefix.strip():
            cmd_i.extend(["--", norm_prefix])
        code_i, stdout_i, _ = run_cmd(cmd_i)
        if code_i == 0 and stdout_i.strip():
            stdout = stdout_i
        else:
            return f"No matches found for query '{query}'."
    lines = stdout.strip().splitlines()
    if len(lines) > 60:
        return "\n".join(lines[:60]) + f"\n... ({len(lines) - 60} more matches truncated)"
    return "\n".join(lines)


def find_files(pattern: str) -> str:
    """Locates repository files matching a glob or pattern."""
    pat = pattern.strip()
    if not pat:
        return "No pattern provided."
    glob_pat = pat if any(c in pat for c in ["*", "?", "["]) else f"*{pat}*"
    code, stdout, _ = run_cmd(["git", "ls-files", glob_pat])
    if code != 0 or not stdout.strip():
        code_all, out_all, _ = run_cmd(["git", "ls-files"])
        if code_all == 0 and out_all.strip():
            matches = [f for f in out_all.splitlines() if pat.lower() in f.lower()]
            if matches:
                if len(matches) > 60:
                    return "\n".join(matches[:60]) + f"\n... ({len(matches) - 60} more matches truncated)"
                return "\n".join(matches)
        return f"No files found matching pattern '{pattern}'."
    lines = stdout.strip().splitlines()
    if len(lines) > 60:
        return "\n".join(lines[:60]) + f"\n... ({len(lines) - 60} more matches truncated)"
    return "\n".join(lines)


def read_file_snippet(file_path: str, start_line: int = 1, end_line: int = 80) -> str:
    """Reads a line range from a repository file."""
    try:
        target_path = safe_resolve_repo_path(file_path)
    except Exception as e:
        return f"Error resolving path '{file_path}': {e}"
    if not target_path.exists() or not target_path.is_file():
        return f"File '{file_path}' does not exist on disk."
    try:
        content = target_path.read_text(encoding="utf-8", errors="replace")
        lines = content.splitlines()
        total_lines = len(lines)
        start = max(1, start_line)
        end = min(total_lines, max(start, end_line))
        if end - start > 150:
            end = start + 150
        snippet_lines = [f"{i}: {lines[i - 1]}" for i in range(start, end + 1)]
        header = f"=== File: {file_path} (Lines {start}-{end} of {total_lines}) ==="
        return header + "\n" + "\n".join(snippet_lines)
    except Exception as e:
        return f"Error reading file '{file_path}': {e}"


# =========================================================================
# STAGE 0: DIAGNOSTIC EXPLORATION
# =========================================================================
@dataclass
class DiagnosticResult:
    target_files: List[str]
    root_cause: str
    code_snippets: Dict[str, str]
    investigation_summary: str


def parse_issue_diagnostics(issue_body: str) -> Tuple[List[str], str]:
    """
    Extracts explicit target files/suspected components and root cause analysis
    from the issue body (handling Model 1 template format and markdown headings).
    Returns (suspected_files, root_cause).
    """
    suspected_files: List[str] = []
    root_cause: str = ""

    # Look for Target Files / Suspected Components section
    target_files_match = re.search(
        r"(?:###?|\*\*)\s*(?:Target Files|Suspected Components|Target Files & Suspected Components)[\s\S]*?(?=(?:###?|\*\*|$))",
        issue_body,
        re.IGNORECASE,
    )
    if target_files_match:
        section_text = target_files_match.group(0)
        file_candidates = re.findall(
            r"[-*]\s*[`'\"]?([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)[`'\"]?",
            section_text,
        )
        file_candidates += re.findall(
            r"[`'\"]([a-zA-Z0-9_./-]+\.(?:ts|tsx|js|jsx|json|sql|ya?ml|css))[`'\"]",
            section_text,
        )
        file_candidates += re.findall(
            r"((?:lib|components|app|pages|supabase|types|src|scripts)/[a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)",
            section_text,
        )
        for f in file_candidates:
            clean_f = f.strip().strip("`'\",")
            if clean_f and clean_f not in suspected_files:
                suspected_files.append(clean_f)

    # Look for Root Cause section
    root_cause_match = re.search(
        r"(?:###?|\*\*)\s*Root Cause[\s\S]*?(?=(?:###?|\*\*|$))",
        issue_body,
        re.IGNORECASE,
    )
    if root_cause_match:
        root_cause = root_cause_match.group(0).strip()

    # Fallback: scan whole issue body for candidate source files if no explicit section matched
    if not suspected_files:
        all_paths = re.findall(
            r"[`'\"]([a-zA-Z0-9_./-]+\.(?:ts|tsx|js|jsx|json|sql|ya?ml|css))[`'\"]",
            issue_body,
        )
        all_paths += re.findall(
            r"((?:lib|components|app|pages|supabase|types|src|scripts)/[a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)",
            issue_body,
        )
        for p in all_paths:
            clean_p = p.strip().strip("`'\",")
            if clean_p and clean_p not in suspected_files:
                suspected_files.append(clean_p)

    return suspected_files, root_cause


def stage_0_diagnose(
    client: Any,
    issue_title: str,
    issue_body: str,
    token_tracker: TokenTracker,
) -> DiagnosticResult:
    """
    Stage 0 Diagnostic Loop:
    1. Extracts explicit 'Target Files & Suspected Components' and 'Root Cause' from issue body.
    2. If explicit files are provided, inspects and verifies them using exploration tools.
    3. If not provided or incomplete, runs an iterative diagnostic loop (up to 4-6 tool calls)
       searching for keywords, UI strings, or handlers to discover actual source files and offending functions.
    4. Returns DiagnosticResult with verified target files and code snippets.
    """
    log(f"\n--- [Stage 0] Diagnostic Exploration for: {issue_title} ---")
    suspected_files, parsed_root_cause = parse_issue_diagnostics(issue_body)

    verified_files: List[str] = []
    code_snippets: Dict[str, str] = {}
    investigation_log: List[str] = []

    # Step 1: Inspect explicit files if provided in issue body
    if suspected_files:
        log(f"Parsed {len(suspected_files)} candidate target file(s) from issue body: {suspected_files}")
        for sf in suspected_files:
            try:
                target_p = safe_resolve_repo_path(sf)
                if target_p.exists() and target_p.is_file():
                    verified_files.append(sf)
                    snippet = read_file_snippet(sf, 1, 100)
                    code_snippets[sf] = snippet
                    investigation_log.append(f"Verified explicit file '{sf}' on disk ({len(snippet.splitlines())} lines read).")
                else:
                    search_res = find_files(Path(sf).name)
                    investigation_log.append(f"Explicit file '{sf}' not found on disk. find_files result:\n{search_res}")
                    for line in search_res.splitlines():
                        line_f = line.strip()
                        if line_f and (PROJECT_ROOT / line_f).is_file() and line_f not in verified_files:
                            verified_files.append(line_f)
                            code_snippets[line_f] = read_file_snippet(line_f, 1, 100)
            except Exception as e:
                investigation_log.append(f"Could not resolve explicit file '{sf}': {e}")

    # Step 2: If no verified files were found or exploration is needed, run iterative diagnostic loop
    if not verified_files:
        log("No explicit target files verified on disk. Starting iterative tool-equipped diagnostic loop...")
        max_tool_calls = 5
        history: List[str] = []

        for step in range(1, max_tool_calls + 1):
            log(f"Diagnostic loop step {step}/{max_tool_calls}...")
            history_text = "\n".join(history) if history else "No previous tool calls."
            discovered_text = ", ".join(verified_files) if verified_files else "None"

            prompt = f"""You are the Stage 0 Diagnostic Exploration Agent diagnosing an issue in this repository.
Your mission is to find the exact source files and offending functions or components causing the problem.

ISSUE TITLE: {issue_title}

ISSUE BODY:
{issue_body}

PREVIOUS TOOL ACTIONS & OBSERVATIONS:
{history_text}

VERIFIED RELEVANT FILES SO FAR:
{discovered_text}

AVAILABLE TOOLS:
1. `grep_search`: Query strings, function names, error text, or keywords across the codebase.
2. `find_files`: Find files by glob or pattern (e.g. '*navigation*', '*winery*').
3. `read_file_snippet`: Inspect 1-indexed line range of a file.
4. `conclude`: Conclude investigation once the root cause and target files are identified.

Choose your next action to locate the relevant files and offending logic.
Respond strictly in valid JSON matching the DiagnosticAction schema.
"""
            action: DiagnosticAction = call_gemini_with_fallback(
                client,
                prompt,
                DEFAULT_PLANNER_MODELS,
                schema_cls=DiagnosticAction,
                temperature=0.1,
                token_tracker=token_tracker,
            )

            log(f"Diagnostic Action [{step}]: {action.action} (Reason: {action.reasoning})")

            # Collect any files declared by the agent
            for tf in action.discovered_target_files:
                try:
                    p = safe_resolve_repo_path(tf)
                    if p.exists() and p.is_file() and tf not in verified_files:
                        verified_files.append(tf)
                        if tf not in code_snippets:
                            code_snippets[tf] = read_file_snippet(tf, 1, 100)
                except Exception:
                    pass

            if action.action == "conclude":
                investigation_log.append(f"Concluded diagnosis at step {step}: {action.reasoning}")
                if action.discovered_target_files:
                    investigation_log.append(f"Identified target files: {action.discovered_target_files}")
                break

            tool_output = ""
            if action.action == "grep_search":
                tool_output = grep_search(action.query, action.path_prefix)
            elif action.action == "find_files":
                tool_output = find_files(action.pattern)
            elif action.action == "read_file_snippet":
                tool_output = read_file_snippet(action.file_path, action.start_line, action.end_line)
                if "=== File:" in tool_output and action.file_path not in verified_files:
                    try:
                        p = safe_resolve_repo_path(action.file_path)
                        if p.exists() and p.is_file():
                            verified_files.append(action.file_path)
                            code_snippets[action.file_path] = tool_output
                    except Exception:
                        pass
            else:
                tool_output = f"Unknown action: {action.action}"

            history.append(f"Step {step}: Action={action.action}, Args={action.model_dump(exclude={'action', 'reasoning', 'discovered_target_files'})}\nResult:\n{tool_output[:1500]}")
            investigation_log.append(f"Step {step} {action.action}: {action.reasoning}")

    summary_str = "\n".join(investigation_log)
    log(f"Stage 0 complete: {len(verified_files)} verified file(s) identified.")
    return DiagnosticResult(
        target_files=verified_files,
        root_cause=parsed_root_cause or "Diagnosed via repository exploration.",
        code_snippets=code_snippets,
        investigation_summary=summary_str,
    )


class Stage2CompilationError(RuntimeError):
    """Raised when Stage 2 test authoring fails TypeScript compilation repeatedly."""
    pass


# =========================================================================
# STAGE 1: PLANNER (Architectural Blueprint)
# =========================================================================
def stage_1_plan(
    client: Any,
    issue_number: int,
    issue_title: str,
    issue_body: str,
    token_tracker: TokenTracker,
    negative_feedback: str = "",
    diagnostic_result: Optional[DiagnosticResult] = None,
) -> BlueprintPlan:
    """Generates task-plan.md and structured file manifest using Planner model."""
    log(f"\n--- [Stage 1] Architectural Planning for Issue #{issue_number} ---")
    project_context = get_project_context()

    feedback_section = ""
    if negative_feedback:
        feedback_section = f"""### PREVIOUS ARCHITECTURAL ATTEMPT FAILED WITH COMPILER/RED-PHASE ERRORS:
{negative_feedback}
Revise your architectural blueprint to resolve these failures. Do not re-attempt an incompatible design.
"""

    diagnostic_section = ""
    if diagnostic_result:
        snippets_formatted = ""
        for fp, snip in diagnostic_result.code_snippets.items():
            snippets_formatted += f"\n```typescript\n// {fp}\n{snip}\n```\n"

        diagnostic_section = f"""### STAGE 0 DIAGNOSTIC INVESTIGATION FINDINGS:
Verified Target Files:
{json.dumps(diagnostic_result.target_files, indent=2)}

Root Cause / Suspected Behavior:
{diagnostic_result.root_cause}

Discovered Code Snippets:
{snippets_formatted or 'No snippets captured.'}

Investigation Summary:
{diagnostic_result.investigation_summary}
"""

    prompt = f"""You are the Staff Principal Architect generating an authoritative implementation blueprint for Issue #{issue_number}: {issue_title}.

{project_context}

ISSUE CONTEXT:
Issue #{issue_number}: {issue_title}

{issue_body}
{feedback_section}
{diagnostic_section}
INSTRUCTIONS & ARCHITECTURAL INVARIANTS:
1. Inspect the requirements and determine the minimal, high-cohesion target files to create or modify. Anchor your plan to verified code from Stage 0 diagnostics.
2. DOMAIN MODEL INVARIANT (CONTEXT.md): Adhere strictly to the canonical domain model and architectural rules documented in CONTEXT.md and AGENTS.md.
3. COMPONENT BOUNDARY ISOLATION: Maintain clean component boundaries with single responsibility. Do not overload existing single-purpose components for multi-entity or unrelated concerns; create dedicated components and utilities when introducing new responsibilities.
4. REACT 19 & NEXT.JS 16 JSX TRANSFORM: React automatic JSX runtime is active. Do not plan or author tests/components with unnecessary `import React from 'react'` unless React namespace methods are directly referenced, to avoid TS6133 (`noUnusedLocals`).
5. TEST HARNESS MOCKING INVARIANT: In Jest/JSDOM, `window.location` is locked and non-configurable. Never plan or author tests that attempt to overwrite locked browser globals; mock helper functions or use dependency injection instead.
6. Formulate full TypeScript interfaces, prop types, and behavioral logic (edge cases, fallbacks).
7. Identify explicit target test files (e.g. `lib/utils/__tests__/foo.test.ts` or `components/__tests__/Bar.test.tsx`).
8. Identify explicit target application source files (e.g. `lib/utils/foo.ts` or `components/Bar.tsx`).
9. Determine a clean conventional commit scope (e.g. `winery`, `trip`, `geo`, `ui`).

Respond strictly in valid JSON matching the BlueprintPlan schema.
"""

    blueprint: BlueprintPlan = call_gemini_with_fallback(
        client,
        prompt,
        DEFAULT_PLANNER_MODELS,
        schema_cls=BlueprintPlan,
        temperature=0.2,
        token_tracker=token_tracker,
    )

    for tf in blueprint.target_test_files:
        safe_resolve_repo_path(tf)
    for sf in blueprint.target_src_files:
        safe_resolve_repo_path(sf)

    plan_path = PROJECT_ROOT / "task-plan.md"
    plan_path.write_text(blueprint.plan_markdown, encoding="utf-8")

    log("Authoritative blueprint written to task-plan.md (uncommitted).")
    log(f"Commit Scope: {blueprint.scope}")
    log(f"Target test files: {blueprint.target_test_files}")
    log(f"Target source files: {blueprint.target_src_files}")
    return blueprint


# =========================================================================
# STAGE 2: RED PHASE EXECUTOR (Author Failing Tests with Self-Correction)
# =========================================================================
def validate_jest_red_phase(t_code: int, t_out: str, t_err: str) -> Tuple[bool, str]:
    """
    Validates that a Jest test run failed as expected for a strict TDD Red Phase.
    A valid Red Phase failure MUST:
      1. Exit with non-zero exit code (t_code != 0).
      2. NOT pass (t_code == 0 is an immediate invariant violation).
      3. NOT crash with fatal harness errors (numRuntimeErrorTestSuites > 0, testExecError,
         fatal errors in lifecycle hooks like beforeEach/beforeAll, or Cannot redefine property).
      4. Contain verified test-level assertion or unimplemented function failures (expect(...) or fn() is not a function).
    Returns (is_valid, error_diagnostics).
    """
    if t_code == 0:
        return False, "Red phase invariant violated: newly authored tests unexpectedly passed before implementation."

    full_output = f"{t_out}\n{t_err}".strip()

    # 1. Inspect structured JSON output if present
    json_match = re.search(r"(\{[\s\S]*\"testResults\"[\s\S]*\})", t_out)
    if json_match:
        try:
            data = json.loads(json_match.group(1))
            num_runtime_errs = data.get("numRuntimeErrorTestSuites", 0)
            if num_runtime_errs > 0:
                return False, f"Jest reported {num_runtime_errs} test suite(s) with fatal runtime errors."

            test_results = data.get("testResults", [])
            has_valid_failure = False

            for suite in test_results:
                if suite.get("testExecError"):
                    msg = suite["testExecError"].get("message", "Unknown test execution error")
                    first_lines = "\n".join(msg.strip().splitlines()[:10])
                    return False, f"Test suite execution failed with fatal error:\n{first_lines}"

                for assertion in suite.get("assertionResults", []):
                    if assertion.get("status") == "failed":
                        failure_msgs = assertion.get("failureMessages", [])
                        joined_failures = "\n".join(failure_msgs)

                        # Detect fatal lifecycle hook or unconfigurable environment crashes
                        is_hook_crash = False
                        if "Cannot redefine property:" in joined_failures:
                            is_hook_crash = True
                        elif re.search(r"(beforeAll|beforeEach|afterEach|afterAll)\s+hook", joined_failures, re.IGNORECASE):
                            is_hook_crash = True

                        if is_hook_crash:
                            first_lines = "\n".join(joined_failures.strip().splitlines()[:10])
                            return False, f"Test suite crashed with fatal hook/harness error:\n{first_lines}"

                        has_valid_failure = True

            if not has_valid_failure and data.get("numFailedTests", 0) == 0:
                return False, "No test failures recorded in test results."

            return True, ""
        except json.JSONDecodeError:
            pass

    # 2. CLI fallback (when --json wasn't parsed or CLI text output received)
    fatal_patterns = [
        r"Cannot redefine property:",
        r"Jest encountered an unexpected token",
        r"Test suite failed to run",
        r"SyntaxError:",
    ]
    for pattern in fatal_patterns:
        match = re.search(pattern, full_output, re.IGNORECASE)
        if match:
            lines = full_output.splitlines()
            error_context = []
            for idx, line in enumerate(lines):
                if re.search(pattern, line, re.IGNORECASE):
                    start = max(0, idx - 2)
                    end = min(len(lines), idx + 8)
                    error_context = lines[start:end]
                    break
            diag = "\n".join(error_context) if error_context else match.group(0)
            return False, f"Test suite crashed with fatal runtime/harness error:\n{diag}"

    # Verify presence of test failure markers
    if any(marker in full_output for marker in ["FAIL ", "● ", "expect(", "is not a function", "Received:"]):
        return True, ""

    return False, f"Tests failed with exit code {t_code}, but failure did not match expected assertion failure pattern."


def stage_2_red(
    client: Any,
    issue_number: int,
    issue_title: str,
    blueprint: BlueprintPlan,
    token_tracker: TokenTracker,
    new_src_files: Optional[List[str]] = None,
    initial_error_context: str = "",
) -> None:
    """Authors failing unit/component tests in target_test_files with a 2-attempt compiler self-correction loop."""
    log(f"\n--- [Stage 2] Red Phase Executor for Issue #{issue_number} ---")
    scope = blueprint.scope
    target_tests = blueprint.target_test_files

    if not target_tests:
        raise RuntimeError("No target test files specified in architectural blueprint.")

    if new_src_files is None:
        new_src_files = [sf for sf in blueprint.target_src_files if not safe_resolve_repo_path(sf).exists()]

    plan_md = (PROJECT_ROOT / "task-plan.md").read_text(encoding="utf-8")
    last_compiler_error = initial_error_context
    max_red_retries = 2

    for attempt in range(1, max_red_retries + 1):
        log(f"Authoring tests (attempt {attempt}/{max_red_retries})...")

        existing_tests_context = ""
        for tf in target_tests:
            p = safe_resolve_repo_path(tf)
            if p.exists():
                existing_tests_context += f"\nFILE: {tf}\n```typescript\n{p.read_text(encoding='utf-8')}\n```\n"

        new_src_prompt_section = ""
        if new_src_files:
            new_src_prompt_section = f"""
BRAND NEW TARGET SOURCE FILES (NOT YET CREATED ON DISK):
{json.dumps(new_src_files, indent=2)}

NOTE ON BRAND NEW SOURCE FILES:
The files above do not exist in the repository yet. To ensure TypeScript compilation passes (`npm run type-check`), you MUST provide minimal type definitions and function stubs (throwing `new Error("Not implemented")`) in `source_stubs` for each of these files. This allows test imports to compile cleanly (exit 0) and fail at runtime in Jest.
Existing source files must remain untouched.
"""

        prompt = f"""You are the Red Phase Executor Agent authoring failing tests for Issue #{issue_number}: {issue_title}.

ARCHITECTURAL BLUEPRINT (task-plan.md):
{plan_md}

EXISTING TEST CONTEXT:
{existing_tests_context or 'Target test files do not yet exist.'}

TARGET TEST FILES:
{json.dumps(target_tests, indent=2)}
{new_src_prompt_section}
{last_compiler_error}

DIRECTIVES (STRICT TDD RED PHASE):
1. Author comprehensive unit or component tests in the TARGET TEST FILES that assert the behavior requested in task-plan.md.
2. For existing source files, DO NOT modify any production or source code files. Existing code must remain untouched.
3. For brand new source files listed above, provide minimal TypeScript function/type stubs (throwing new Error("Not implemented")) in `source_stubs` so that test imports compile cleanly (exit 0) and fail at runtime in Jest.
4. COMPILER STRICTNESS INVARIANT (TS6133): In tsconfig.json, 'noUnusedParameters' and 'noUnusedLocals' are active. In your source_stubs, any unused function parameters MUST be prefixed with an underscore '_' (e.g. `_options: any`). In test files, DO NOT include unused imports (such as `import React from 'react'`) to prevent TS6133 compiler failures.
5. TYPE HYGIENE: Ensure custom types, interfaces, and function signatures do not clash with global browser DOM or Node.js built-ins. Use explicit type imports and clean naming.
6. Tests must be valid TypeScript: correct imports, mock setups (Jest/Testing Library), and type annotations.
7. Output complete file contents for each target test file.
8. JSDOM & BROWSER MOCKING INVARIANT: In Jest/JSDOM, `window.location` is locked and non-configurable. DO NOT attempt to redefine or overwrite it via `Object.defineProperty(window, 'location', ...)`. Instead, test navigation by mocking helper functions, using dependency injection, or utilizing jest.spyOn. Ensure test setup hooks (`beforeEach`/`afterEach`) execute cleanly without throwing unhandled exceptions.

Respond strictly in valid JSON matching the TestFileManifest schema.
"""

        manifest: TestFileManifest = call_gemini_with_fallback(
            client,
            prompt,
            DEFAULT_EXECUTOR_MODELS,
            schema_cls=TestFileManifest,
            temperature=0.2,
            token_tracker=token_tracker,
        )

        staged_stubs: List[str] = []
        for stub in getattr(manifest, "source_stubs", []):
            if stub.file_path in new_src_files or (stub.file_path in blueprint.target_src_files and not safe_resolve_repo_path(stub.file_path).exists()):
                p = safe_resolve_repo_path(stub.file_path)
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(stub.content, encoding="utf-8")
                log(f"Wrote initial source stub: {stub.file_path}")
                staged_stubs.append(stub.file_path)
                if stub.file_path not in new_src_files:
                    new_src_files.append(stub.file_path)

        # Fallback scaffolding: ensure any un-stubbed new source file at least exists on disk
        for nsf in new_src_files:
            p = safe_resolve_repo_path(nsf)
            if not p.exists():
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text("export {};\n", encoding="utf-8")
                log(f"Scaffolded empty fallback stub: {nsf}")
                staged_stubs.append(nsf)

        for entry in manifest.files:
            p = safe_resolve_repo_path(entry.file_path)
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(entry.content, encoding="utf-8")
            log(f"Wrote test file: {entry.file_path}")

        # Compiler Gate: npm run type-check must exit 0
        log("Verifying TypeScript compilation (npm run type-check)...")
        tc_code, tc_out, tc_err = run_isolated_test(["npm", "run", "type-check"])
        if tc_code != 0:
            last_compiler_error = f"""PREVIOUS COMPILATION FAILED:
Exit Code: {tc_code}
TypeScript Errors:
{tc_err or tc_out}
Fix the imports, type annotations, and mock declarations in the target test files.
Ensure all new source files listed above have appropriate function/type stubs in source_stubs.
Prefix any unused stub parameters with '_' to avoid TS6133 errors.
"""
            log(f"TypeScript compilation failed on attempt {attempt}:\n{tc_err or tc_out}")
            if attempt < max_red_retries:
                continue
            raise Stage2CompilationError(f"Red phase test authoring failed TypeScript compilation after {max_red_retries} attempts:\n{tc_err or tc_out}")

        # Red Verification Gate: jest test must fail with clean assertion failures, NOT runtime harness crashes
        log("Verifying test failure against current production code...")
        test_cmd = ["npx", "jest", "--json"] + target_tests
        t_code, t_out, t_err = run_isolated_test(test_cmd)

        is_valid_red, red_diagnostics = validate_jest_red_phase(t_code, t_out, t_err)
        if not is_valid_red:
            last_compiler_error = f"""PREVIOUS TESTS FAILED RED PHASE VERIFICATION:
{red_diagnostics}

Your tests crashed at runtime instead of failing assertions on unimplemented features.
Ensure test setup hooks (beforeEach/afterEach) and mocks are completely valid in JSDOM:
- DO NOT use Object.defineProperty to overwrite window.location (it is locked and non-configurable in JSDOM).
- Use Jest spies on utility functions or mock interfaces instead of mutating browser globals.
- Ensure all imports, mocks, and fixtures exist and execute cleanly.
"""
            log(f"Red phase verification failed on attempt {attempt}: {red_diagnostics}")
            if attempt < max_red_retries:
                continue
            raise RuntimeError(f"Red phase failed verification after {max_red_retries} attempts: {red_diagnostics}")

        log(f"Red phase verified successfully: tests failed with valid assertions (exit code {t_code}).")

        # Commit Red phase tests and initial source stubs
        run_cmd(["git", "add"] + target_tests + staged_stubs, check=True)
        commit_msg = f"test({scope}): Add failing tests for Issue #{issue_number}"
        run_cmd(["git", "commit", "-m", commit_msg], check=True)
        log(f"Committed: {commit_msg}")
        return


# =========================================================================
# STAGE 3: GREEN PHASE EXECUTOR (Patch Engine & Full Regression Gate)
# =========================================================================
def stage_3_green(
    client: Any,
    issue_number: int,
    issue_title: str,
    blueprint: BlueprintPlan,
    token_tracker: TokenTracker,
    new_src_files: Optional[List[str]] = None,
    baseline_ref: str = "HEAD",
    resumption_context: Optional[str] = None,
) -> None:
    """Implements production code with search/replace patching, targeted testing, and mandatory full regression gate."""
    log(f"\n--- [Stage 3] Green Phase Executor for Issue #{issue_number} ---")
    scope = blueprint.scope
    target_tests = blueprint.target_test_files
    target_src = blueprint.target_src_files

    if not target_src:
        raise RuntimeError("No target source files specified in architectural blueprint.")

    plan_md = (PROJECT_ROOT / "task-plan.md").read_text(encoding="utf-8")

    tests_content = ""
    for tf in target_tests:
        p = safe_resolve_repo_path(tf)
        if p.exists():
            tests_content += f"\nTEST FILE ({tf}):\n```typescript\n{p.read_text(encoding='utf-8')}\n```\n"

    last_error_context = ""
    max_retries = 3

    resumption_section = ""
    if resumption_context:
        resumption_section = f"\n### RESUMPTION CONTEXT & MAINTAINER GUIDANCE:\n{resumption_context}\n"

    for attempt in range(1, max_retries + 1):
        log(f"Implementation attempt {attempt}/{max_retries}...")

        # Reset target source files to clean baseline before each attempt to prevent compounding patch errors
        reset_target_sources(target_src, baseline_ref=baseline_ref)

        src_content = ""
        for sf in target_src:
            p = safe_resolve_repo_path(sf)
            if new_src_files and sf in new_src_files:
                stub_text = p.read_text(encoding="utf-8") if p.exists() else ""
                src_content += f"\nSOURCE FILE ({sf}): (brand new file created for this issue - set search_block='' to replace complete content or patch stub)\n```typescript\n{stub_text}\n```\n"
            elif p.exists():
                src_content += f"\nSOURCE FILE ({sf}):\n```typescript\n{p.read_text(encoding='utf-8')}\n```\n"
            else:
                src_content += f"\nSOURCE FILE ({sf}): (new file to create - set search_block='')\n"

        prompt = f"""You are the Green Phase Executor Agent implementing code to satisfy Issue #{issue_number}: {issue_title}.

ARCHITECTURAL BLUEPRINT:
{plan_md}

TESTS TO PASS:
{tests_content}

CURRENT SOURCE FILES:
{src_content}
{resumption_section}
{last_error_context}

DIRECTIVES (STRICT TDD GREEN PHASE - TARGETED SEARCH/REPLACE PATCHING):
1. Implement the minimal necessary production code in TARGET SOURCE FILES to satisfy the tests and TypeScript types.
2. Adhere strictly to domain standards, coordinate rules, and TypeScript signatures from task-plan.md.
3. CONCISE SEARCH BLOCKS: Keep search_block concise (between 3 and 10 lines of unique anchor context). Do NOT include large 30+ line blocks of surrounding code, imports, or boilerplate.
4. For existing files, specify exact search_block character sequences to replace, including sufficient surrounding context lines to ensure unique matching.
5. For new files, set search_block to an empty string and provide complete file content in replace_block.
6. TYPE HYGIENE: Ensure custom types, interfaces, and function signatures do not clash with global browser DOM or Node.js built-ins. Use explicit type imports and clean naming.

Respond strictly in valid JSON matching the PatchManifest schema.
"""

        manifest: PatchManifest = call_gemini_with_fallback(
            client,
            prompt,
            DEFAULT_EXECUTOR_MODELS,
            schema_cls=PatchManifest,
            temperature=0.2,
            token_tracker=token_tracker,
        )

        patch_success, patch_errors = apply_patch_manifest(manifest, new_src_files=new_src_files)
        if not patch_success:
            last_error_context = "PREVIOUS ATTEMPT FAILED TO APPLY PATCHES:\n" + "\n".join(patch_errors) + "\nEnsure exact match of search_block against clean baseline source files."
            log(f"Attempt {attempt} patch application failed:\n" + "\n".join(patch_errors))
            continue

        # Targeted Verification Loop
        log("Running targeted verification checks...")
        tc_code, tc_out, tc_err = run_isolated_test(["npm", "run", "type-check"])
        test_cmd = ["npx", "jest"] + target_tests
        t_code, t_out, t_err = run_isolated_test(test_cmd)

        if tc_code == 0 and t_code == 0:
            log("Targeted checks passed! Running MANDATORY FULL REGRESSION GATE (full test suite + type-check)...")
            reg_code, reg_out, reg_err = run_isolated_test(["npm", "test"])
            reg_tc_code, reg_tc_out, reg_tc_err = run_isolated_test(["npm", "run", "type-check"])

            if reg_code == 0 and reg_tc_code == 0:
                log("Mandatory full regression suite passed cleanly!")
                if baseline_ref != "HEAD":
                    log(f"Resumption mode: soft-resetting branch to {baseline_ref[:8]} to squash WIP commits...")
                    run_cmd(["git", "reset", "--soft", baseline_ref], check=True)
                    for f in [".agent-state.json", "AGENT_HANDOFF.md"]:
                        p = PROJECT_ROOT / f
                        if p.exists():
                            p.unlink()
                run_cmd(["git", "add"] + target_src, check=True)
                commit_msg = f"feat({scope}): Implement changes to satisfy Issue #{issue_number}"
                run_cmd(["git", "commit", "-m", commit_msg], check=True)
                log(f"Committed: {commit_msg}")
                return

            last_error_context = f"""TARGETED TESTS PASSED BUT MANDATORY FULL REGRESSION GATE FAILED:
Full Jest Suite Exit Code: {reg_code}
Full Jest Suite Errors:
{reg_err or reg_out}

Full TypeScript Check Exit Code: {reg_tc_code}
Full TypeScript Errors:
{reg_tc_err or reg_tc_out}

The working tree has been reverted to clean baseline. Ensure your implementation satisfies new tests without breaking existing application features or types.
"""
            log(f"Attempt {attempt} regression gate failed:")
            if reg_code != 0:
                log(f"Regression Jest Suite Errors:\n{reg_err or reg_out}")
            if reg_tc_code != 0:
                log(f"Regression TypeScript Errors:\n{reg_tc_err or reg_tc_out}")
            continue

        last_error_context = f"""PREVIOUS ATTEMPT FAILED TARGETED VERIFICATION:
TypeScript Check Exit Code: {tc_code}
TypeScript Errors:
{tc_err or tc_out}

Jest Test Exit Code: {t_code}
Jest Errors:
{t_err or t_out}

The working tree has been reverted to clean baseline. Generate a corrected patch against baseline that resolves these errors.
"""
        log(f"Attempt {attempt} verification failed:")
        if tc_code != 0:
            log(f"TypeScript Errors:\n{tc_err or tc_out}")
        if t_code != 0:
            log(f"Jest Errors:\n{t_err or t_out}")

    raise RuntimeError(f"Green phase implementation failed to pass tests after {max_retries} attempts.\n{last_error_context}")


def fetch_maintainer_hints(issue_number: int, last_failure_timestamp: str) -> str:
    """Fetches comments authored strictly by jarredb9 created after last_failure_timestamp."""
    code, out, _ = gh_cli([
        "issue", "view", str(issue_number),
        "--json", "comments",
    ])
    if code != 0 or not out:
        return ""
    try:
        data = json.loads(out)
        comments = data.get("comments", [])
        hints = []
        for c in comments:
            author = c.get("author", {}).get("login", "")
            body = c.get("body", "").strip()
            created_at = c.get("createdAt", "")
            if author == "jarredb9":
                if not last_failure_timestamp or created_at > last_failure_timestamp:
                    hints.append(f"Comment from @jarredb9 ({created_at}):\n{body}")
        if hints:
            log(f"Ingested {len(hints)} guidance comment(s) from maintainer @jarredb9.")
        return "\n\n".join(hints)
    except Exception as e:
        log(f"Warning: Failed to parse maintainer comments: {e}")
        return ""


def update_or_create_pr(
    issue_number: int,
    issue_title: str,
    blueprint: BlueprintPlan,
    branch_name: str,
    token_tracker: TokenTracker,
    elapsed_sec: int,
    is_resumption: bool = False,
) -> None:
    """Creates a new Draft PR or mutates an existing Draft PR in-place."""
    resumption_tag = " [Resumed from previous checkpoint]" if is_resumption else ""
    pr_body = f"""## Summary
Autonomous multi-agent resolution for Issue #{issue_number}: {issue_title}

Closes #{issue_number}

### Pipeline Execution Details
1. **Architectural Blueprint:** Authored `task-plan.md` using `{DEFAULT_PLANNER_MODELS[0]}`.
2. **Red Phase Executor:** Authored failing tests (`test({blueprint.scope}): ...`) with 2-attempt compiler self-correction loop using `{DEFAULT_EXECUTOR_MODELS[0]}`.
3. **Green Phase Executor:** Implemented minimal code satisfying tests via search/replace patches (`feat({blueprint.scope}): ...`).{resumption_tag}

### Observability & Verification
- **Verification:** Targeted suite and full regression gate (`npm test` and `npm run type-check`) passed cleanly inside network-isolated sandbox.
- **Duration:** {elapsed_sec} seconds.
- **Token Consumption:** {token_tracker.summary()}.
- **Target Files:**
  - Tests: {", ".join(f"`{f}`" for f in blueprint.target_test_files)}
  - Source: {", ".join(f"`{f}`" for f in blueprint.target_src_files)}
"""
    pr_body = sanitize_secrets(pr_body)
    pr_code, pr_list_out, _ = gh_cli(["pr", "list", "--head", branch_name, "--state", "open", "--json", "number"])
    existing_pr_num = None
    if pr_code == 0 and pr_list_out.strip():
        try:
            prs = json.loads(pr_list_out)
            if prs:
                existing_pr_num = prs[0]["number"]
        except Exception:
            pass

    if existing_pr_num:
        log(f"Updating existing Draft PR #{existing_pr_num} in-place...")
        gh_cli([
            "pr", "edit", str(existing_pr_num),
            "--title", f"fix({blueprint.scope}): {issue_title}",
            "--body", pr_body,
            "--remove-label", "ready-for-human",
            "--add-label", "agent:in-review",
        ])
        gh_cli(["issue", "edit", str(issue_number), "--remove-label", "agent:in-progress", "--remove-label", "ready-for-human", "--remove-label", "agent:resolve", "--add-label", "agent:in-review"])
        gh_cli(["issue", "comment", str(issue_number), "--body", f"✅ Autonomous multi-agent Draft PR #{existing_pr_num} updated with passing implementation.\n\n{token_tracker.summary()}."])
    else:
        log(f"Creating new Draft Pull Request...")
        pr_res, pr_out, pr_err = gh_cli([
            "pr", "create",
            "--draft",
            "--title", f"fix({blueprint.scope}): {issue_title}",
            "--body", pr_body,
            "--head", branch_name,
            "--base", "main",
            "--reviewer", "jarredb9",
            "--label", "agent:in-review",
        ])
        if pr_res != 0:
            raise RuntimeError(f"Failed to create Draft PR via gh CLI (exit code {pr_res}):\n{pr_err}\n{pr_out}")
        gh_cli(["issue", "edit", str(issue_number), "--remove-label", "agent:in-progress", "--remove-label", "ready-for-agent", "--remove-label", "agent:resolve", "--add-label", "agent:in-review"])
        gh_cli(["issue", "comment", str(issue_number), "--body", f"✅ Autonomous multi-agent Draft PR submitted for review: {pr_out.strip()}\n\n{token_tracker.summary()}."])


def preserve_failed_work(
    issue_number: int,
    issue_title: str,
    blueprint: Optional[BlueprintPlan],
    branch_name: str,
    error_summary: str,
    token_tracker: TokenTracker,
    elapsed_sec: int,
    dry_run: bool = False,
) -> None:
    """Preserves failed agent state, commits WIP code and diagnostics, and pushes to origin."""
    error_summary = sanitize_secrets(error_summary)
    if blueprint is None:
        log(f"No architectural blueprint produced for Issue #{issue_number}; cleaning up branch.")
        cleanup_feature_branch(branch_name)
        if not dry_run:
            gh_cli(["issue", "edit", str(issue_number), "--remove-label", "agent:in-progress", "--remove-label", "agent:resolve", "--add-label", "ready-for-human"])
            gh_cli(["issue", "comment", str(issue_number), "--body", f"⚠️ Autonomous agent resolution halted during Stage 1 planning ({elapsed_sec}s):\n\n```\n{error_summary}\n```\n\nIssue downgraded to `ready-for-human` for morning maintainer review."])
        return

    scope = blueprint.scope
    target_tests = blueprint.target_test_files
    target_src = blueprint.target_src_files

    # Check if a Red Phase commit exists
    _, red_sha_out, _ = run_cmd(["git", "log", "--grep=^test(", "-n", "1", "--format=%H"])
    red_phase_commit_sha = red_sha_out.strip()

    # Commit any uncommitted source or test changes (excluding task-plan.md)
    _, status_out, _ = run_cmd(["git", "status", "--porcelain"])
    if status_out.strip():
        staged_targets = [f for f in target_tests + target_src if (PROJECT_ROOT / f).exists()]
        if staged_targets:
            run_cmd(["git", "add"] + staged_targets)
            run_cmd(["git", "commit", "-m", f"wip({scope}): Incomplete implementation for Issue #{issue_number} [skip ci]"])

    # Prepare checkpoint state
    now_iso = datetime.now(timezone.utc).isoformat()
    prev_attempts = 0
    state_path = PROJECT_ROOT / ".agent-state.json"
    if state_path.exists():
        try:
            prev_attempts = int(json.loads(state_path.read_text(encoding="utf-8")).get("attempt_count", 0))
        except Exception:
            pass

    current_attempt = prev_attempts + 1

    state_data = {
        "version": "1.0",
        "issue_number": issue_number,
        "issue_title": issue_title,
        "scope": scope,
        "plan_markdown": blueprint.plan_markdown if blueprint else "",
        "target_test_files": target_tests,
        "target_src_files": target_src,
        "red_phase_commit_sha": red_phase_commit_sha,
        "failed_phase": "stage_3_green" if red_phase_commit_sha else "stage_2_red",
        "attempt_count": current_attempt,
        "last_failure_timestamp": now_iso,
        "error_summary": error_summary,
    }

    state_path = PROJECT_ROOT / ".agent-state.json"
    state_path.write_text(json.dumps(state_data, indent=2), encoding="utf-8")

    handoff_md = f"""# Autonomous Agent Handoff: Issue #{issue_number}

- **Issue**: #{issue_number} - {issue_title}
- **Scope**: {scope}
- **Timestamp**: {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")}
- **Failed Phase**: {state_data["failed_phase"]}
- **Tokens Used**: {token_tracker.summary()}
- **Duration**: {elapsed_sec}s

## Diagnostics & Error Context
```
{error_summary}
```

## Target Files
- **Tests**: {", ".join(f"`{f}`" for f in target_tests)}
- **Source**: {", ".join(f"`{f}`" for f in target_src)}

## How to Resume Locally
```bash
git checkout {branch_name}
npm run type-check
npx jest {" ".join(target_tests)}
```

## How to Queue for Next Overnight Run
1. Inspect the diagnostics above and add guidance comments on Issue #{issue_number}.
2. Re-apply label `agent:resolve` to Issue #{issue_number}.
"""
    handoff_path = PROJECT_ROOT / "AGENT_HANDOFF.md"
    handoff_path.write_text(handoff_md, encoding="utf-8")

    run_cmd(["git", "add", ".agent-state.json", "AGENT_HANDOFF.md"])
    run_cmd(["git", "commit", "-m", f"docs(agent): Checkpoint state for Issue #{issue_number} [skip ci]"])

    if dry_run:
        log(f"[Dry Run] Checkpoint state written for Issue #{issue_number}.")
        reset_working_tree_to_main()
        run_cmd(["git", "branch", "-D", branch_name])
        return

    # Push WIP branch
    log(f"Pushing WIP branch {branch_name} to origin...")
    gh_token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    push_env = os.environ.copy()
    if gh_token:
        push_env["GH_TOKEN"] = gh_token
    run_cmd(["git", "push", "--force", "origin", branch_name], env=push_env, check=True)

    # Check for existing PR
    pr_code, pr_list_out, _ = gh_cli(["pr", "list", "--head", branch_name, "--state", "open", "--json", "number"])
    existing_pr_num = None
    if pr_code == 0 and pr_list_out.strip():
        try:
            prs = json.loads(pr_list_out)
            if prs:
                existing_pr_num = prs[0]["number"]
        except Exception:
            pass

    wip_title = f"WIP: fix({scope}): {issue_title} [FAILED CHECKS]"
    wip_body = f"""## WIP Autonomous Agent Run

Issue #{issue_number} failed implementation verification checks after {elapsed_sec}s.
See `AGENT_HANDOFF.md` and `.agent-state.json` on branch `{branch_name}` for full diagnostics.

Closes #{issue_number}

### Metrics
- **Tokens Used:** {token_tracker.summary()}
- **Duration:** {elapsed_sec}s
- **Status:** Handed off to human maintainer for review or guidance comment.
"""

    if existing_pr_num:
        log(f"Updating Draft PR #{existing_pr_num} to WIP state...")
        gh_cli([
            "pr", "edit", str(existing_pr_num),
            "--title", wip_title,
            "--body", wip_body,
            "--remove-label", "agent:in-review",
            "--add-label", "ready-for-human",
        ])
    else:
        log("Creating WIP Draft PR...")
        gh_cli([
            "pr", "create",
            "--draft",
            "--title", wip_title,
            "--body", wip_body,
            "--head", branch_name,
            "--base", "main",
            "--reviewer", "jarredb9",
            "--label", "ready-for-human",
        ])

    gh_cli(["issue", "edit", str(issue_number), "--remove-label", "agent:in-progress", "--remove-label", "agent:resolve", "--add-label", "ready-for-human"])
    if current_attempt >= 2:
        failure_comment = (
            f"🛑 Autonomous agent resolution permanently halted after {current_attempt} consecutive overnight attempts ({elapsed_sec}s):\n\n"
            f"```\n{error_summary}\n```\n\n"
            f"**Metrics:** {token_tracker.summary()}\n\n"
            f"WIP branch `{branch_name}` pushed to origin with `AGENT_HANDOFF.md`. "
            f"Circuit breaker triggered. Issue permanently downgraded to `ready-for-human` for maintainer review."
        )
    else:
        failure_comment = (
            f"⚠️ Autonomous agent resolution halted during overnight execution ({elapsed_sec}s):\n\n"
            f"```\n{error_summary}\n```\n\n"
            f"**Metrics:** {token_tracker.summary()}\n\n"
            f"WIP branch `{branch_name}` pushed to origin with `AGENT_HANDOFF.md`. "
            f"Issue downgraded to `ready-for-human` for morning maintainer review. "
            f"To re-queue for the next overnight run, reply with guidance and re-apply `agent:resolve`."
        )
    gh_cli(["issue", "comment", str(issue_number), "--body", failure_comment])

    # Preserve diagnostic artifacts in a dedicated directory before wiping working tree
    artifacts_dir = PROJECT_ROOT / "diagnostic-artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    for f_name in [".agent-state.json", "AGENT_HANDOFF.md", "task-plan.md"]:
        src_file = PROJECT_ROOT / f_name
        if src_file.exists():
            shutil.copy2(src_file, artifacts_dir / f_name)
    for log_file in PROJECT_ROOT.glob("*.log"):
        if log_file.is_file():
            shutil.copy2(log_file, artifacts_dir / log_file.name)

    reset_working_tree_to_main()


def resolve_issue(client: Any, issue_data: Dict[str, Any], dry_run: bool = False) -> bool:
    """Processes a single issue through the 3-stage TDD pipeline with git isolation and stateful resumption."""
    issue_number = issue_data["number"]
    issue_title = issue_data.get("title", "")
    issue_body = issue_data.get("body", "")
    author_login = issue_data.get("author", {}).get("login", "")

    start_time = time.time()
    token_tracker = TokenTracker()
    blueprint: Optional[BlueprintPlan] = None

    log(f"\n=======================================================")
    log(f"Processing Issue #{issue_number}: {issue_title}")
    log(f"Author: {author_login}")
    log(f"=======================================================")

    # Security & Provenance Gate
    if author_login != "jarredb9":
        log(f"Security Gate Rejected: Issue #{issue_number} authored by '{author_login}', not 'jarredb9'.")
        if not dry_run:
            gh_cli(["issue", "edit", str(issue_number), "--remove-label", "agent:resolve", "--add-label", "ready-for-human"])
            gh_cli(["issue", "comment", str(issue_number), "--body", "⚠️ Autonomous agent resolution rejected: Issue author is not verified repository maintainer."])
        return False

    branch_name = f"agent/issue-{issue_number}"

    # Idempotency guard: skip if open PR is already in review and issue is not explicitly re-queued
    pr_code, pr_list_out, _ = gh_cli(["pr", "list", "--head", branch_name, "--state", "open", "--json", "number,labels"])
    if pr_code == 0 and pr_list_out.strip():
        try:
            existing_prs = json.loads(pr_list_out)
            if existing_prs:
                pr_labels = [l.get("name") for l in existing_prs[0].get("labels", [])]
                issue_labels = [l.get("name") for l in issue_data.get("labels", [])]
                if "agent:in-review" in pr_labels and "agent:resolve" not in issue_labels:
                    log(f"Skipping Issue #{issue_number}: Open PR #{existing_prs[0]['number']} on {branch_name} is already in review.")
                    return True
        except Exception:
            pass

    reset_working_tree_to_main()

    if not dry_run:
        gh_cli(["issue", "edit", str(issue_number), "--remove-label", "agent:resolve", "--add-label", "agent:in-progress"])

    is_resumption = False

    try:
        # Check if remote branch exists for Stateful Iterative Resumption
        code_ls, _, _ = run_cmd(["git", "ls-remote", "--exit-code", "--heads", "origin", branch_name])
        if code_ls == 0:
            log(f"Existing remote branch {branch_name} detected. Fetching for resumption...")
            run_cmd(["git", "fetch", "origin", f"{branch_name}:{branch_name}"])
            run_cmd(["git", "checkout", branch_name])
            run_cmd(["git", "reset", "--hard", f"origin/{branch_name}"])

            # Attempt rebase onto origin/main
            reb_code, _, _ = run_cmd(["git", "rebase", "origin/main"])
            if reb_code != 0:
                log(f"Rebase conflict on {branch_name} against origin/main. Aborting rebase and starting fresh.")
                run_cmd(["git", "rebase", "--abort"])
                if not dry_run:
                    gh_cli(["issue", "comment", str(issue_number), "--body", "⚡ Upstream `main` diverged with merge conflicts; resetting checkpoint and starting fresh resolution from `origin/main`."])
                reset_working_tree_to_main()
                run_cmd(["git", "checkout", "-B", branch_name, "origin/main"])
            else:
                log(f"Rebase onto origin/main applied cleanly.")
                state_path = PROJECT_ROOT / ".agent-state.json"
                plan_path = PROJECT_ROOT / "task-plan.md"
                checkpoint_loaded = False
                state_data = {}
                if state_path.exists():
                    try:
                        state_data = json.loads(state_path.read_text(encoding="utf-8"))
                        plan_md = state_data.get("plan_markdown", "")
                        if not plan_md and plan_path.exists():
                            plan_md = plan_path.read_text(encoding="utf-8")
                        if plan_md:
                            plan_path.write_text(plan_md, encoding="utf-8")
                            checkpoint_loaded = True
                    except Exception as e_load:
                        log(f"Warning: Failed to parse checkpoint state: {e_load}. Starting fresh from origin/main.")
                        reset_working_tree_to_main()
                        run_cmd(["git", "checkout", "-B", branch_name, "origin/main"])

                if checkpoint_loaded:
                    attempt_count = int(state_data.get("attempt_count", 1))
                    if attempt_count >= 2:
                        log(f"🛑 Circuit breaker triggered: Issue #{issue_number} has reached max overnight attempts ({attempt_count}). Halting automated execution.")
                        cleanup_feature_branch(branch_name)
                        if not dry_run:
                            gh_cli(["issue", "edit", str(issue_number), "--remove-label", "agent:in-progress", "--remove-label", "agent:resolve", "--add-label", "ready-for-human"])
                            gh_cli(["issue", "comment", str(issue_number), "--body", f"🛑 Autonomous agent resolution permanently halted: Issue #{issue_number} reached {attempt_count} consecutive overnight attempts without resolution. Escalated to maintainer."])
                        return False

                    red_sha = state_data.get("red_phase_commit_sha")
                    if not red_sha:
                        _, out_sha, _ = run_cmd(["git", "log", "--grep=^test(", "-n", "1", "--format=%H"])
                        red_sha = out_sha.strip()

                    t_tests = state_data.get("target_test_files", [])
                    t_src = state_data.get("target_src_files", [])
                    t_scope = state_data.get("scope", "agent")
                    last_fail_ts = state_data.get("last_failure_timestamp", "")

                    if red_sha and t_tests and t_src:
                        log(f"Running deterministic Red Gate verification for checkpoint {red_sha[:8]}...")
                        reset_target_sources(t_src, baseline_ref=red_sha)
                        tc_code, tc_out, tc_err = run_isolated_test(["npm", "run", "type-check"])
                        t_code, t_out, t_err = run_isolated_test(["npx", "jest", "--json"] + t_tests)

                        is_valid_red, red_diagnostics = validate_jest_red_phase(t_code, t_out, t_err)

                        if tc_code == 0 and is_valid_red:
                            log(f"⚡ Checkpoint verified! (type-check passed, clean assertion failures). Fast-forwarding directly to Stage 3 Green Phase!")
                            is_resumption = True
                            blueprint = BlueprintPlan(
                                scope=t_scope,
                                target_test_files=t_tests,
                                target_src_files=t_src,
                                plan_markdown=state_data.get("plan_markdown") or (plan_path.read_text(encoding="utf-8") if plan_path.exists() else ""),
                            )
                            new_src_files = [sf for sf in blueprint.target_src_files if not safe_resolve_repo_path(sf).exists()]

                            maintainer_hints = fetch_maintainer_hints(issue_number, last_fail_ts)
                            _, wip_diff, _ = run_cmd(["git", "diff", red_sha, "HEAD", "--"] + t_src)

                            resumption_context = f"PREVIOUS ATTEMPT FAILED WITH:\n{state_data.get('error_summary', '')}\n"
                            if wip_diff:
                                resumption_context += f"\nPREVIOUS WIP CODE DIFF (FAILED ATTEMPT):\n```diff\n{wip_diff[:4000]}\n```\n"
                            if maintainer_hints:
                                resumption_context += f"\nMAINTAINER GUIDANCE FROM @jarredb9:\n{maintainer_hints}\n"

                            stage_3_green(
                                client,
                                issue_number,
                                issue_title,
                                blueprint,
                                token_tracker,
                                new_src_files=new_src_files,
                                baseline_ref=red_sha,
                                resumption_context=resumption_context,
                            )
                        else:
                            if tc_code != 0:
                                fail_reason = f"TypeScript check exit code {tc_code} ({tc_err or tc_out})"
                            else:
                                fail_reason = f"Invalid test failure in checkpoint ({red_diagnostics})"
                            log(f"Checkpoint verification failed: {fail_reason}.")

                            # Autonomous Checkpoint Invalidation:
                            # Roll back to the blueprint plan commit (red_sha~1) and re-author clean Red Phase tests.
                            log("⚡ Autonomous Checkpoint Invalidation: Rolling back to blueprint commit to re-author clean Red Phase tests...")
                            parent_check, _, _ = run_cmd(["git", "rev-parse", "--verify", f"{red_sha}~1"])
                            if parent_check == 0:
                                run_cmd(["git", "reset", "--hard", f"{red_sha}~1"])
                                blueprint = BlueprintPlan(
                                    scope=t_scope,
                                    target_test_files=t_tests,
                                    target_src_files=t_src,
                                    plan_markdown=state_data.get("plan_markdown") or (plan_path.read_text(encoding="utf-8") if plan_path.exists() else ""),
                                )
                                new_src_files = [sf for sf in blueprint.target_src_files if not safe_resolve_repo_path(sf).exists()]

                                initial_err = f"PREVIOUS CHECKPOINT TESTS CRASHED AT RUNTIME:\n{red_diagnostics}\nFix mocks and test hooks so tests fail purely on assertion expectations."
                                try:
                                    stage_2_red(
                                        client,
                                        issue_number,
                                        issue_title,
                                        blueprint,
                                        token_tracker,
                                        new_src_files=new_src_files,
                                        initial_error_context=initial_err,
                                    )
                                except Stage2CompilationError as s2_err:
                                    log(f"⚡ Tier 3 Blueprint Invalidation: Stage 2 test authoring hit an architectural dead end: {s2_err}")
                                    log("Resetting to origin/main and re-planning Stage 1 with negative feedback...")
                                    reset_working_tree_to_main()
                                    run_cmd(["git", "checkout", "-B", branch_name, "origin/main"])
                                    blueprint = stage_1_plan(
                                        client,
                                        issue_number,
                                        issue_title,
                                        issue_body,
                                        token_tracker,
                                        negative_feedback=f"""PREVIOUS ARCHITECTURAL BLUEPRINT FAILED COMPILATION IN RED PHASE:
Failed Blueprint:
{blueprint.plan_markdown}

Target Source Files:
{blueprint.target_src_files}

Compiler Errors:
{s2_err}

Do not attempt to modify incompatible existing components; design clean, isolated modules and interfaces with correct prop signatures and exports."""
                                    )
                                    new_src_files = [sf for sf in blueprint.target_src_files if not safe_resolve_repo_path(sf).exists()]
                                    stage_2_red(
                                        client,
                                        issue_number,
                                        issue_title,
                                        blueprint,
                                        token_tracker,
                                        new_src_files=new_src_files,
                                    )

                                stage_3_green(
                                    client,
                                    issue_number,
                                    issue_title,
                                    blueprint,
                                    token_tracker,
                                    new_src_files=new_src_files,
                                    baseline_ref="HEAD",
                                )
                                is_resumption = True
                            else:
                                log(f"Warning: Could not verify parent of {red_sha[:8]}, starting fresh from origin/main.")
                                reset_working_tree_to_main()
                                run_cmd(["git", "checkout", "-B", branch_name, "origin/main"])
        else:
            run_cmd(["git", "checkout", "-B", branch_name, "origin/main"])

        # If not resuming, run full pipeline starting with Stage 0 Diagnostic Exploration
        if not is_resumption:
            # Stage 0: Diagnostic Exploration
            diagnostic_result = stage_0_diagnose(client, issue_title, issue_body, token_tracker)

            # Stage 1: Blueprint Plan
            blueprint = stage_1_plan(
                client,
                issue_number,
                issue_title,
                issue_body,
                token_tracker,
                diagnostic_result=diagnostic_result,
            )

            # Track any brand new source files designated in the blueprint
            new_src_files = [sf for sf in blueprint.target_src_files if not safe_resolve_repo_path(sf).exists()]

            # Stage 2: Red Phase Tests with Tier 3 Blueprint Invalidation fallback
            try:
                stage_2_red(client, issue_number, issue_title, blueprint, token_tracker, new_src_files=new_src_files)
            except Stage2CompilationError as s2_err:
                log(f"⚡ Tier 3 Blueprint Invalidation: Stage 2 test authoring hit an architectural dead end: {s2_err}")
                log("Resetting to origin/main and re-planning Stage 1 with negative feedback...")
                reset_working_tree_to_main()
                run_cmd(["git", "checkout", "-B", branch_name, "origin/main"])
                blueprint = stage_1_plan(
                    client,
                    issue_number,
                    issue_title,
                    issue_body,
                    token_tracker,
                    negative_feedback=f"""PREVIOUS ARCHITECTURAL BLUEPRINT FAILED COMPILATION IN RED PHASE:
Failed Blueprint:
{blueprint.plan_markdown}

Target Source Files:
{blueprint.target_src_files}

Compiler Errors:
{s2_err}

Do not attempt to modify incompatible existing components; design clean, isolated modules and interfaces with correct prop signatures and exports.""",
                    diagnostic_result=diagnostic_result,
                )
                new_src_files = [sf for sf in blueprint.target_src_files if not safe_resolve_repo_path(sf).exists()]
                stage_2_red(client, issue_number, issue_title, blueprint, token_tracker, new_src_files=new_src_files)

            # Stage 3: Green Phase Implementation
            stage_3_green(client, issue_number, issue_title, blueprint, token_tracker, new_src_files=new_src_files)

        elapsed_sec = int(time.time() - start_time)

        if dry_run:
            log(f"[Dry Run] Issue #{issue_number} successfully resolved locally in {elapsed_sec}s.")
            log(f"[Dry Run] Token usage: {token_tracker.summary()}")
            reset_working_tree_to_main()
            run_cmd(["git", "branch", "-D", branch_name])
            return True

        # Git hygiene: Ensure task-plan.md is NOT committed or included in PR diff
        code_tp, _, _ = run_cmd(["git", "ls-files", "--error-unmatch", "task-plan.md"])
        if code_tp == 0:
            run_cmd(["git", "rm", "-f", "task-plan.md"])
            run_cmd(["git", "commit", "-m", "chore: remove task-plan.md from branch"])
        plan_p = PROJECT_ROOT / "task-plan.md"
        if plan_p.exists():
            plan_p.unlink()

        # Push branch & submit or update Draft Pull Request
        log(f"Pushing branch {branch_name} to origin...")
        gh_token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
        push_env = os.environ.copy()
        if gh_token:
            push_env["GH_TOKEN"] = gh_token
        run_cmd(["git", "push", "--force", "origin", branch_name], env=push_env, check=True)

        update_or_create_pr(
            issue_number,
            issue_title,
            blueprint,
            branch_name,
            token_tracker,
            elapsed_sec,
            is_resumption=is_resumption,
        )
        log(f"Issue #{issue_number} resolved and submitted for review.")

        reset_working_tree_to_main()
        return True

    except Exception as e:
        elapsed_sec = int(time.time() - start_time)
        log(f"\n❌ Error resolving Issue #{issue_number} after {elapsed_sec}s: {e}", file=sys.stderr)
        preserve_failed_work(
            issue_number=issue_number,
            issue_title=issue_title,
            blueprint=blueprint,
            branch_name=branch_name,
            error_summary=str(e),
            token_tracker=token_tracker,
            elapsed_sec=elapsed_sec,
            dry_run=dry_run,
        )
        return False


def main():
    parser = argparse.ArgumentParser(description="Autonomous GitHub Issue Resolver Harness")
    parser.add_argument("--issue", "-i", type=int, help="Specific GitHub issue number to resolve")
    parser.add_argument("--max-issues", "-m", type=int, default=3, help="Maximum number of issues to process (default: 3)")
    parser.add_argument("--dry-run", action="store_true", help="Run without pushing branches or updating GitHub issues")
    args = parser.parse_args()

    client = get_genai_client()

    if args.issue:
        code, out, err = gh_cli(["issue", "view", str(args.issue), "--json", "number,title,body,author,labels"])
        if code != 0:
            log(f"Error viewing issue #{args.issue}: {err}", file=sys.stderr)
            sys.exit(1)
        issue_data = json.loads(out)
        success = resolve_issue(client, issue_data, dry_run=args.dry_run)
        sys.exit(0 if success else 1)

    log(f"Querying up to {args.max_issues} open issues labeled 'agent:resolve'...")
    code, out, err = gh_cli([
        "issue", "list",
        "--state", "open",
        "--label", "agent:resolve",
        "--limit", str(args.max_issues),
        "--json", "number,title,body,author,labels",
    ])
    if code != 0:
        log(f"Error querying issues: {err}", file=sys.stderr)
        sys.exit(1)

    issues = json.loads(out)
    if not issues:
        log("No open issues labeled 'agent:resolve' found.")
        sys.exit(0)

    log(f"Found {len(issues)} issue(s) to process.")
    results: List[Tuple[int, bool]] = []
    for idx, issue in enumerate(issues):
        if idx > 0 and BATCH_PACING_SECONDS > 0:
            log(f"Pacing delay: sleeping {BATCH_PACING_SECONDS}s before next issue...")
            time.sleep(BATCH_PACING_SECONDS)

        success = resolve_issue(client, issue, dry_run=args.dry_run)
        results.append((issue["number"], success))

    log("\n================ BATCH EXECUTION SUMMARY ================")
    all_success = True
    for num, success in results:
        status_icon = "✅ SUCCESS" if success else "❌ FAILED"
        log(f"Issue #{num}: {status_icon}")
        if not success:
            all_success = False
    log("=========================================================\n")

    if not all_success:
        log("Batch execution finished with one or more failed issues.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
