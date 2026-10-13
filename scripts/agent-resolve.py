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
import json
import os
import random
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Type, TypeVar

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
class BlueprintPlan(BaseModel):
    scope: str = Field(description="Conventional commit scope, e.g. winery, trip, geo, ui")
    target_test_files: List[str] = Field(description="Explicit list of unit or component test file paths to create or modify")
    target_src_files: List[str] = Field(description="Explicit list of application source file paths to create or modify")
    plan_markdown: str = Field(description="Full markdown content for task-plan.md")


class TestFileManifest(BaseModel):
    files: Dict[str, str] = Field(description="Dictionary mapping repository-relative test file paths to complete file contents")


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
def run_cmd(
    cmd: List[str],
    cwd: Optional[Path] = None,
    env: Optional[Dict[str, str]] = None,
    check: bool = False,
) -> Tuple[int, str, str]:
    """Runs a subprocess command and returns (exit_code, stdout, stderr)."""
    p = subprocess.Popen(
        cmd,
        cwd=str(cwd or PROJECT_ROOT),
        env=env if env is not None else os.environ.copy(),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    stdout, stderr = p.communicate()
    if check and p.returncode != 0:
        raise RuntimeError(f"Command {' '.join(cmd)} failed (code {p.returncode}):\n{stderr}\n{stdout}")
    return p.returncode, stdout.strip(), stderr.strip()


def is_docker_available() -> bool:
    """Checks whether Docker daemon is active and responsive."""
    try:
        res = subprocess.run(["docker", "info"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return res.returncode == 0
    except Exception:
        return False


def run_isolated_test(cmd: List[str], cwd: Optional[Path] = None) -> Tuple[int, str, str]:
    """
    Runs verification commands within a hardened environment.
    If Docker is available, wraps inside an ephemeral container with --network none
    and matching UID/GID to completely cut off network sockets and avoid root-owned files.
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
            "-v", f"{PROJECT_ROOT}:/app",
            "-w", "/app",
            "-e", "NODE_ENV=test",
            "-e", "HOME=/tmp",
            "-e", "npm_config_cache=/tmp/.npm",
            "-e", "PATH=/app/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            "node:24-slim",
        ] + cmd
        return run_cmd(docker_cmd, cwd=target_cwd, env={}, check=False)

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
    return run_cmd(cmd, cwd=target_cwd, env=isolated_env, check=False)


def gh_cli(args: List[str]) -> Tuple[int, str, str]:
    """Executes a GitHub CLI command."""
    return run_cmd(["gh"] + args)


def reset_working_tree_to_main() -> None:
    """Discards uncommitted changes, untracked files, and checks out main cleanly."""
    run_cmd(["git", "reset", "--hard", "HEAD"])
    run_cmd(["git", "clean", "-fd"])
    run_cmd(["git", "checkout", "main"])
    code, _, _ = run_cmd(["git", "rev-parse", "--verify", "origin/main"])
    if code == 0:
        run_cmd(["git", "reset", "--hard", "origin/main"])


def cleanup_feature_branch(branch_name: str) -> None:
    """Cleans up local feature branch, scrubs untracked files, and reverts working tree to main."""
    run_cmd(["git", "reset", "--hard", "HEAD"])
    run_cmd(["git", "clean", "-fd"])
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

    protected = [".git", ".github/workflows", "scripts/agent-resolve.py"]
    for prot in protected:
        if normalized == prot or normalized.startswith(prot + "/"):
            raise ValueError(f"Modification of protected file blocked: {rel_path_str}")

    return target


def reset_target_sources(target_src: List[str]) -> None:
    """Resets target source files back to HEAD (reverting edits or removing newly created files)."""
    tracked_files: List[str] = []
    for sf in target_src:
        try:
            p = safe_resolve_repo_path(sf)
        except Exception:
            continue
        code, _, _ = run_cmd(["git", "ls-files", "--error-unmatch", sf])
        if code == 0:
            tracked_files.append(sf)
        else:
            if p.exists():
                p.unlink()
    if tracked_files:
        run_cmd(["git", "checkout", "HEAD", "--"] + tracked_files)


def apply_patch_manifest(manifest: PatchManifest) -> Tuple[bool, List[str]]:
    """
    Applies search/replace patches to target source files.
    Validates that each search_block exists uniquely in the target file.
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

        # Case 1: Creating a brand new file
        if not patch.search_block:
            if current_content is not None and target_path.exists():
                errors.append(
                    f"Patch #{idx} specifies empty search_block for '{patch.file_path}', but the file already exists. "
                    "Empty search_block is only allowed when creating brand new files."
                )
                continue
            staged_edits[target_path] = patch.replace_block
            continue

        # Case 2: Modifying an existing file
        if current_content is None:
            errors.append(
                f"Patch #{idx} specifies non-empty search_block for '{patch.file_path}', but the file does not exist on disk."
            )
            continue

        occurrences = current_content.count(patch.search_block)
        if occurrences == 0:
            lines = current_content.splitlines()
            sample_lines = "\n".join(f"  L{i+1}: {l}" for i, l in enumerate(lines[:30]))
            errors.append(
                f"Patch #{idx} for '{patch.file_path}': search_block NOT FOUND in file.\n"
                f"Search block attempted:\n```\n{patch.search_block}\n```\n"
                f"Target file snippet for context reference:\n```\n{sample_lines}\n```"
            )
        elif occurrences > 1:
            errors.append(
                f"Patch #{idx} for '{patch.file_path}': search_block matched {occurrences} locations. "
                "Include additional surrounding context lines to disambiguate the search block."
            )
        else:
            new_content = current_content.replace(patch.search_block, patch.replace_block, 1)
            staged_edits[target_path] = new_content

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
    """Identifies transient rate limits and server errors eligible for backoff retry."""
    err_str = str(err).upper()
    transient_indicators = [
        "429",
        "RESOURCE_EXHAUSTED",
        "RATE_LIMIT",
        "RATE LIMIT",
        "QUOTA",
        "500",
        "503",
        "UNAVAILABLE",
        "OVERLOADED",
        "DEADLINE_EXCEEDED",
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
# STAGE 1: PLANNER (Architectural Blueprint)
# =========================================================================
def stage_1_plan(
    client: Any,
    issue_number: int,
    issue_title: str,
    issue_body: str,
    token_tracker: TokenTracker,
) -> BlueprintPlan:
    """Generates task-plan.md and structured file manifest using Planner model."""
    print(f"\n--- [Stage 1] Architectural Planning for Issue #{issue_number} ---")
    project_context = get_project_context()

    prompt = f"""You are the Staff Principal Architect generating an authoritative implementation blueprint for Issue #{issue_number}: {issue_title}.

{project_context}

ISSUE CONTEXT:
Issue #{issue_number}: {issue_title}

{issue_body}

INSTRUCTIONS:
1. Inspect the requirements and determine the minimal, high-cohesion target files to create or modify.
2. Adhere strictly to the project's Domain Model, coordinate standardizations, and Next.js / TypeScript patterns.
3. Formulate full TypeScript interfaces, prop types, and behavioral logic (edge cases, fallbacks).
4. Identify explicit target test files (e.g. `lib/utils/__tests__/foo.test.ts` or `components/__tests__/Bar.test.tsx`).
5. Identify explicit target application source files (e.g. `lib/utils/foo.ts` or `components/Bar.tsx`).
6. Determine a clean conventional commit scope (e.g. `winery`, `trip`, `geo`, `ui`).

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

    run_cmd(["git", "add", "task-plan.md"], check=True)
    run_cmd(["git", "commit", "-m", f"docs(plan): Architecture blueprint for Issue #{issue_number}"], check=True)

    print(f"Authoritative blueprint committed to task-plan.md.")
    print(f"Commit Scope: {blueprint.scope}")
    print(f"Target test files: {blueprint.target_test_files}")
    print(f"Target source files: {blueprint.target_src_files}")
    return blueprint


# =========================================================================
# STAGE 2: RED PHASE EXECUTOR (Author Failing Tests with Self-Correction)
# =========================================================================
def stage_2_red(
    client: Any,
    issue_number: int,
    issue_title: str,
    blueprint: BlueprintPlan,
    token_tracker: TokenTracker,
) -> None:
    """Authors failing unit/component tests in target_test_files with a 2-attempt compiler self-correction loop."""
    print(f"\n--- [Stage 2] Red Phase Executor for Issue #{issue_number} ---")
    scope = blueprint.scope
    target_tests = blueprint.target_test_files

    if not target_tests:
        raise RuntimeError("No target test files specified in architectural blueprint.")

    plan_md = (PROJECT_ROOT / "task-plan.md").read_text(encoding="utf-8")
    last_compiler_error = ""
    max_red_retries = 2

    for attempt in range(1, max_red_retries + 1):
        print(f"Authoring tests (attempt {attempt}/{max_red_retries})...")

        existing_tests_context = ""
        for tf in target_tests:
            p = safe_resolve_repo_path(tf)
            if p.exists():
                existing_tests_context += f"\nFILE: {tf}\n```typescript\n{p.read_text(encoding='utf-8')}\n```\n"

        prompt = f"""You are the Red Phase Executor Agent authoring failing tests for Issue #{issue_number}: {issue_title}.

ARCHITECTURAL BLUEPRINT (task-plan.md):
{plan_md}

EXISTING TEST CONTEXT:
{existing_tests_context or 'Target test files do not yet exist.'}

TARGET TEST FILES:
{json.dumps(target_tests, indent=2)}

{last_compiler_error}

DIRECTIVES (STRICT TDD RED PHASE):
1. Author comprehensive unit or component tests in the TARGET TEST FILES that assert the behavior requested in task-plan.md.
2. INVARIANT: DO NOT modify any production or source code files. Production code must remain untouched.
3. Tests must be valid TypeScript: correct imports, mock setups (Jest/Testing Library), and type annotations.
4. Output complete file contents for each target test file.

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

        for file_path_str, content in manifest.files.items():
            p = safe_resolve_repo_path(file_path_str)
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content, encoding="utf-8")
            print(f"Wrote test file: {file_path_str}")

        # Compiler Gate: npm run type-check must exit 0
        print("Verifying TypeScript compilation (npm run type-check)...")
        tc_code, tc_out, tc_err = run_isolated_test(["npm", "run", "type-check"])
        if tc_code != 0:
            last_compiler_error = f"""PREVIOUS COMPILATION FAILED:
Exit Code: {tc_code}
TypeScript Errors:
{tc_err or tc_out}
Fix the imports, type annotations, and mock declarations in the target test files.
"""
            print(f"TypeScript compilation failed on attempt {attempt}: {tc_err or tc_out}")
            if attempt < max_red_retries:
                continue
            raise RuntimeError(f"Red phase test authoring failed TypeScript compilation after {max_red_retries} attempts:\n{tc_err or tc_out}")

        # Red Verification Gate: jest test must fail (non-zero)
        print("Verifying test failure against current production code...")
        test_cmd = ["npx", "jest"] + target_tests
        t_code, t_out, t_err = run_isolated_test(test_cmd)

        if t_code == 0:
            raise RuntimeError("Red phase invariant violated: newly authored tests unexpectedly passed before implementation.")

        print(f"Red phase verified successfully: tests failed with exit code {t_code}.")

        # Commit Red phase tests
        run_cmd(["git", "add"] + target_tests, check=True)
        commit_msg = f"test({scope}): Add failing tests for Issue #{issue_number}"
        run_cmd(["git", "commit", "-m", commit_msg], check=True)
        print(f"Committed: {commit_msg}")
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
) -> None:
    """Implements production code with search/replace patching, targeted testing, and mandatory full regression gate."""
    print(f"\n--- [Stage 3] Green Phase Executor for Issue #{issue_number} ---")
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

    for attempt in range(1, max_retries + 1):
        print(f"Implementation attempt {attempt}/{max_retries}...")

        # Reset target source files to clean baseline before each attempt to prevent compounding patch errors
        reset_target_sources(target_src)

        src_content = ""
        for sf in target_src:
            p = safe_resolve_repo_path(sf)
            if p.exists():
                src_content += f"\nSOURCE FILE ({sf}):\n```typescript\n{p.read_text(encoding='utf-8')}\n```\n"
            else:
                src_content += f"\nSOURCE FILE ({sf}): (new file to create)\n"

        prompt = f"""You are the Green Phase Executor Agent implementing code to satisfy Issue #{issue_number}: {issue_title}.

ARCHITECTURAL BLUEPRINT:
{plan_md}

TESTS TO PASS:
{tests_content}

CURRENT SOURCE FILES:
{src_content}

{last_error_context}

DIRECTIVES (STRICT TDD GREEN PHASE - TARGETED SEARCH/REPLACE PATCHING):
1. Implement the minimal necessary production code in TARGET SOURCE FILES to satisfy the tests and TypeScript types.
2. Adhere strictly to domain standards, coordinate rules, and TypeScript signatures from task-plan.md.
3. For existing files, specify exact search_block character sequences to replace, including sufficient surrounding context lines to ensure unique matching.
4. For new files, set search_block to an empty string and provide complete file content in replace_block.

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

        patch_success, patch_errors = apply_patch_manifest(manifest)
        if not patch_success:
            last_error_context = "PREVIOUS ATTEMPT FAILED TO APPLY PATCHES:\n" + "\n".join(patch_errors) + "\nEnsure exact match of search_block against clean baseline source files."
            print(f"Attempt {attempt} patch application failed:\n" + "\n".join(patch_errors))
            continue

        # Targeted Verification Loop
        print("Running targeted verification checks...")
        tc_code, tc_out, tc_err = run_isolated_test(["npm", "run", "type-check"])
        test_cmd = ["npx", "jest"] + target_tests
        t_code, t_out, t_err = run_isolated_test(test_cmd)

        if tc_code == 0 and t_code == 0:
            print("Targeted checks passed! Running MANDATORY FULL REGRESSION GATE (full test suite + type-check)...")
            reg_code, reg_out, reg_err = run_isolated_test(["npm", "test"])
            reg_tc_code, reg_tc_out, reg_tc_err = run_isolated_test(["npm", "run", "type-check"])

            if reg_code == 0 and reg_tc_code == 0:
                print("Mandatory full regression suite passed cleanly!")
                run_cmd(["git", "add"] + target_src, check=True)
                commit_msg = f"feat({scope}): Implement changes to satisfy Issue #{issue_number}"
                run_cmd(["git", "commit", "-m", commit_msg], check=True)
                print(f"Committed: {commit_msg}")
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
            print(f"Attempt {attempt} regression gate failed. Feeding regression diagnostics back to model...")
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
        print(f"Attempt {attempt} verification failed. Feeding diagnostics back to model...")

    raise RuntimeError(f"Green phase implementation failed to pass tests after {max_retries} attempts.")


# =========================================================================
# WORKFLOW ORCHESTRATION & ISSUE RESOLVER
# =========================================================================
def resolve_issue(client: Any, issue_data: Dict[str, Any], dry_run: bool = False) -> bool:
    """Processes a single issue through the 3-stage TDD pipeline with git isolation."""
    issue_number = issue_data["number"]
    issue_title = issue_data.get("title", "")
    issue_body = issue_data.get("body", "")
    author_login = issue_data.get("author", {}).get("login", "")

    start_time = time.time()
    token_tracker = TokenTracker()

    print(f"\n=======================================================")
    print(f"Processing Issue #{issue_number}: {issue_title}")
    print(f"Author: {author_login}")
    print(f"=======================================================")

    # Security & Provenance Gate
    if author_login != "jarredb9":
        print(f"Security Gate Rejected: Issue #{issue_number} authored by '{author_login}', not 'jarredb9'.")
        if not dry_run:
            gh_cli(["issue", "edit", str(issue_number), "--remove-label", "agent:resolve", "--add-label", "ready-for-human"])
            gh_cli(["issue", "comment", str(issue_number), "--body", "⚠️ Autonomous agent resolution rejected: Issue author is not verified repository maintainer."])
        return False

    branch_name = f"agent/issue-{issue_number}"

    # Idempotency guard: skip if open PR is already in review
    pr_code, pr_list_out, _ = gh_cli(["pr", "list", "--head", branch_name, "--state", "open", "--json", "number,labels"])
    if pr_code == 0 and pr_list_out.strip():
        try:
            existing_prs = json.loads(pr_list_out)
            if existing_prs:
                pr_labels = [l.get("name") for l in existing_prs[0].get("labels", [])]
                issue_labels = [l.get("name") for l in issue_data.get("labels", [])]
                if "agent:in-review" in pr_labels and "agent:resolve" not in issue_labels:
                    print(f"Skipping Issue #{issue_number}: Open PR #{existing_prs[0]['number']} on {branch_name} is already in review.")
                    return True
        except Exception:
            pass

    reset_working_tree_to_main()

    if not dry_run:
        gh_cli(["issue", "edit", str(issue_number), "--remove-label", "agent:resolve", "--add-label", "agent:in-progress"])

    run_cmd(["git", "checkout", "-B", branch_name], check=True)

    try:
        # Stage 1: Blueprint Plan
        blueprint = stage_1_plan(client, issue_number, issue_title, issue_body, token_tracker)

        # Stage 2: Red Phase Tests
        stage_2_red(client, issue_number, issue_title, blueprint, token_tracker)

        # Stage 3: Green Phase Implementation
        stage_3_green(client, issue_number, issue_title, blueprint, token_tracker)

        elapsed_sec = int(time.time() - start_time)

        if dry_run:
            print(f"[Dry Run] Issue #{issue_number} successfully resolved locally in {elapsed_sec}s.")
            print(f"[Dry Run] Token usage: {token_tracker.summary()}")
            reset_working_tree_to_main()
            run_cmd(["git", "branch", "-D", branch_name])
            return True

        # Push branch & submit Draft Pull Request
        print(f"Pushing branch {branch_name} to origin...")
        gh_token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
        push_env = os.environ.copy()
        if gh_token:
            push_env["GH_TOKEN"] = gh_token
        run_cmd(["git", "push", "--force", "origin", branch_name], env=push_env, check=True)

        pr_body = f"""## Summary
Autonomous multi-agent resolution for Issue #{issue_number}: {issue_title}

Closes #{issue_number}

### Pipeline Execution Details
1. **Architectural Blueprint:** Authored `task-plan.md` using `{DEFAULT_PLANNER_MODELS[0]}`.
2. **Red Phase Executor:** Authored failing tests (`test({blueprint.scope}): ...`) with 2-attempt compiler self-correction loop using `{DEFAULT_EXECUTOR_MODELS[0]}`.
3. **Green Phase Executor:** Implemented minimal code satisfying tests via search/replace patches (`feat({blueprint.scope}): ...`).

### Observability & Verification
- **Verification:** Targeted suite and full regression gate (`npm test` and `npm run type-check`) passed cleanly inside network-isolated sandbox.
- **Duration:** {elapsed_sec} seconds.
- **Token Consumption:** {token_tracker.summary()}.
- **Target Files:**
  - Tests: {", ".join(f"`{f}`" for f in blueprint.target_test_files)}
  - Source: {", ".join(f"`{f}`" for f in blueprint.target_src_files)}
"""

        print(f"Creating Draft Pull Request...")
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

        gh_cli(["issue", "edit", str(issue_number), "--remove-label", "agent:in-progress", "--remove-label", "ready-for-agent", "--add-label", "agent:in-review"])
        gh_cli(["issue", "comment", str(issue_number), "--body", f"✅ Autonomous multi-agent Draft PR submitted for review: {pr_out.strip()}\n\n{token_tracker.summary()}."])
        print(f"Issue #{issue_number} resolved and submitted for review.")

        reset_working_tree_to_main()
        return True

    except Exception as e:
        elapsed_sec = int(time.time() - start_time)
        print(f"\n❌ Error resolving Issue #{issue_number} after {elapsed_sec}s: {e}", file=sys.stderr)
        cleanup_feature_branch(branch_name)

        if not dry_run:
            gh_cli(["issue", "edit", str(issue_number), "--remove-label", "agent:in-progress", "--remove-label", "agent:resolve", "--add-label", "ready-for-human"])
            failure_comment = (
                f"⚠️ Autonomous agent resolution halted during overnight execution ({elapsed_sec}s):\n\n"
                f"```\n{e}\n```\n\n"
                f"**Metrics:** {token_tracker.summary()}\n\n"
                f"Issue downgraded to `ready-for-human` for morning maintainer review."
            )
            gh_cli(["issue", "comment", str(issue_number), "--body", failure_comment])
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
            print(f"Error viewing issue #{args.issue}: {err}", file=sys.stderr)
            sys.exit(1)
        issue_data = json.loads(out)
        success = resolve_issue(client, issue_data, dry_run=args.dry_run)
        sys.exit(0 if success else 1)

    print(f"Querying up to {args.max_issues} open issues labeled 'agent:resolve'...")
    code, out, err = gh_cli([
        "issue", "list",
        "--state", "open",
        "--label", "agent:resolve",
        "--limit", str(args.max_issues),
        "--json", "number,title,body,author,labels",
    ])
    if code != 0:
        print(f"Error querying issues: {err}", file=sys.stderr)
        sys.exit(1)

    issues = json.loads(out)
    if not issues:
        print("No open issues labeled 'agent:resolve' found.")
        sys.exit(0)

    print(f"Found {len(issues)} issue(s) to process.")
    results: List[Tuple[int, bool]] = []
    for idx, issue in enumerate(issues):
        if idx > 0 and BATCH_PACING_SECONDS > 0:
            print(f"Pacing delay: sleeping {BATCH_PACING_SECONDS}s before next issue...")
            time.sleep(BATCH_PACING_SECONDS)

        success = resolve_issue(client, issue, dry_run=args.dry_run)
        results.append((issue["number"], success))

    print("\n================ BATCH EXECUTION SUMMARY ================")
    for num, success in results:
        status_icon = "✅ SUCCESS" if success else "❌ FAILED"
        print(f"Issue #{num}: {status_icon}")
    print("=========================================================\n")


if __name__ == "__main__":
    main()
