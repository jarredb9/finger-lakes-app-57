#!/usr/bin/env python3
"""
Autonomous Multi-Task Track Execution Runner (conductor-auto.py)

Orchestrates autonomous lifecycle management across Conductor tracks,
implementing Tier 1 (Planning), Tier 2 (Execution), supervisor invariant verification,
checkpoint handling, and unattended reviews.

Usage:
    python3 scripts/agent/conductor-auto.py [track] [options]
    python3 scripts/agent/conductor-auto.py --phase 3
    python3 scripts/agent/conductor-auto.py --phase 3 --task 2 --force-plan
    python3 scripts/agent/conductor-auto.py --dry-run
"""

import argparse
from dataclasses import dataclass, field
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
from typing import Any, Dict, List, Optional, Tuple, Union


# ---------------------------------------------------------------------------
# Project Root & Path Helpers
# ---------------------------------------------------------------------------

def find_project_root() -> Path:
    """Discovers project root containing conductor/ and package.json."""
    current = Path(__file__).resolve().parent
    for p in [current] + list(current.parents):
        if (p / "conductor").exists() and (p / "package.json").exists():
            return p
    return Path.cwd()


PROJECT_ROOT = find_project_root()


# ---------------------------------------------------------------------------
# Custom Exceptions
# ---------------------------------------------------------------------------

class ConductorAutoError(RuntimeError):
    """Base exception for conductor-auto runner failures."""
    pass


class PlanInvariantError(ConductorAutoError):
    """Raised when Tier 1 planning fails to create a blueprint or mutates production code."""
    pass


class ProcessExecutionError(ConductorAutoError):
    """Raised when an agy or child subprocess fails or times out."""
    pass


class SupervisorInvariantError(ConductorAutoError):
    """Raised when Tier 2 execution violates working tree, test, commit, or git note invariants."""
    pass


class GitTreeDirtyError(SupervisorInvariantError):
    """Raised when uncommitted or untracked changes remain after execution/recovery."""
    pass


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

@dataclass
class TaskInfo:
    task_num: int
    description: str
    status: str              # "pending" | "in_progress" | "complete" | "skipped"
    status_char: str         # " " | "~" | "x" | "-"
    is_checkpoint: bool      # True if manual verification / checkpoint end of phase
    commit_sha: Optional[str] = None
    exempt: Optional[str] = None
    subtasks: List[str] = field(default_factory=list)
    raw_line: str = ""


@dataclass
class PhaseInfo:
    phase_num: int
    name: str
    checkpoint_sha: Optional[str]
    raw_heading: str
    tasks: List[TaskInfo] = field(default_factory=list)
    is_complete: bool = False


# ---------------------------------------------------------------------------
# Track & Registry Resolution
# ---------------------------------------------------------------------------

def resolve_track_dir(track_name: Optional[str]) -> Optional[Path]:
    """Resolves track directory path whether active or archived."""
    if not track_name:
        return None
    p = Path(track_name)
    if p.is_dir() and (p / "plan.md").exists():
        return p.resolve()
    if not p.is_absolute():
        p_rel = (PROJECT_ROOT / p).resolve()
        if p_rel.is_dir() and (p_rel / "plan.md").exists():
            return p_rel
    tracks_dir = (PROJECT_ROOT / "conductor" / "tracks" / track_name).resolve()
    if tracks_dir.is_dir():
        return tracks_dir
    archive_dir = (PROJECT_ROOT / "conductor" / "archive" / track_name).resolve()
    if archive_dir.is_dir():
        return archive_dir
    return tracks_dir


def get_active_track() -> Optional[str]:
    """Detects in-progress or available track from conductor/tracks.md."""
    tracks_registry = PROJECT_ROOT / "conductor" / "tracks.md"
    if not tracks_registry.exists():
        return None

    content = tracks_registry.read_text(encoding="utf-8")
    in_progress = re.findall(
        r"\|\s*\*\*([a-zA-Z0-9_\-]+)\*\*\s*\|.*?\|\s*(?:\[~\]|\[[ ~]\]\s*In Progress)",
        content,
        re.IGNORECASE,
    )
    if in_progress:
        return in_progress[0]

    pending = re.findall(r"\|\s*\*\*([a-zA-Z0-9_\-]+)\*\*\s*\|.*?\|\s*\[ \]", content)
    pending = [p for p in pending if p not in in_progress]
    if pending:
        return pending[0]

    tracks_dir = PROJECT_ROOT / "conductor" / "tracks"
    if tracks_dir.exists():
        tracks = [d.name for d in tracks_dir.iterdir() if d.is_dir() and not d.name.startswith(".")]
        if tracks:
            return tracks[0]

    return None


def is_checkpoint_task(task_desc: str) -> bool:
    """Returns True if task description represents a checkpoint or manual verification task."""
    desc_lower = task_desc.lower().strip()
    return (
        "manual verification" in desc_lower
        or "protocol in workflow.md" in desc_lower
        or "checkpoint end of phase" in desc_lower
        or "checkpoint verification" in desc_lower
        or desc_lower.startswith("checkpoint:")
        or desc_lower.startswith("checkpoint ")
        or desc_lower.endswith("checkpoint")
        or bool(re.search(r"\bcheckpoint\s+task\b", desc_lower))
        or desc_lower.startswith("conductor - user manual verification")
    )


# ---------------------------------------------------------------------------
# Track Plan Markdown Parser
# ---------------------------------------------------------------------------

def parse_track_plan(track_path_or_name: Union[str, Path]) -> Dict[int, PhaseInfo]:
    """Parses track plan.md, extracting phases, tasks, subtasks, statuses, and commit SHAs."""
    if isinstance(track_path_or_name, Path):
        if track_path_or_name.is_file():
            plan_path = track_path_or_name
        elif track_path_or_name.is_dir():
            plan_path = track_path_or_name / "plan.md"
        else:
            plan_path = track_path_or_name
    else:
        p = Path(track_path_or_name)
        if p.is_file():
            plan_path = p
        elif p.is_dir():
            plan_path = p / "plan.md"
        else:
            resolved = resolve_track_dir(track_path_or_name)
            plan_path = resolved / "plan.md" if resolved else None

    if not plan_path or not plan_path.exists():
        return {}

    content = plan_path.read_text(encoding="utf-8")
    phases: Dict[int, PhaseInfo] = {}
    current_phase: Optional[PhaseInfo] = None

    checkpoint_header_re = re.compile(
        r"\s*(?:\[checkpoint:\s*([a-f0-9]{7,40})\]|\[([a-f0-9]{7,40})\])\s*$",
        re.IGNORECASE,
    )
    exempt_re = re.compile(r"\[exempt:\s*([a-zA-Z0-9_\-]+)\]", re.IGNORECASE)
    task_sha_re = re.compile(
        r"\s*(?:\(([a-f0-9]{7,40})\)|\[(?:commit:\s*|checkpoint:\s*)?([a-f0-9]{7,40})\]|([a-f0-9]{7,40}))\s*$",
        re.IGNORECASE,
    )

    for line in content.splitlines():
        # Phase header: e.g. ## Phase 1: Setup... or ### Phase 2:... or ## Phase: Review Fixes
        phase_match = re.match(r"^(#{2,3})\s+Phase(?:\s+(\d+))?[:\s]+(.*)", line, re.IGNORECASE)
        if phase_match:
            raw_num = phase_match.group(2)
            raw_title = phase_match.group(3).strip()

            cp_match = checkpoint_header_re.search(raw_title)
            checkpoint_sha = None
            if cp_match:
                checkpoint_sha = cp_match.group(1) or cp_match.group(2)
                phase_title = raw_title[: cp_match.start()].strip()
            else:
                phase_title = raw_title

            raw_heading = checkpoint_header_re.sub("", line.strip()).strip()

            if raw_num:
                phase_num = int(raw_num)
            else:
                phase_num = (max(phases.keys()) + 1) if phases else 1

            current_phase = PhaseInfo(
                phase_num=phase_num,
                name=phase_title,
                checkpoint_sha=checkpoint_sha,
                raw_heading=raw_heading,
                tasks=[],
                is_complete=False,
            )
            phases[phase_num] = current_phase
            continue

        if current_phase is not None:
            # Subtask check (indented by 2+ spaces or tabs before - [ ])
            subtask_match = re.match(r"^(?:\s{2,}|\t+)-\s*\[([ x~X\-])\]\s*(.*)", line)
            if subtask_match and current_phase.tasks:
                current_phase.tasks[-1].subtasks.append(subtask_match.group(2).strip())
                continue

            # Top-level Task item
            task_match = re.match(r"^-\s*\[([ x~X\-])\]\s+(?:Task(?:\s+\d+)?:)?\s*(.*)", line)
            if task_match:
                raw_char = task_match.group(1)
                task_desc = task_match.group(2).strip()

                if raw_char.lower() == "x":
                    status = "complete"
                    status_char = "x"
                elif raw_char == "~":
                    status = "in_progress"
                    status_char = "~"
                elif raw_char == "-":
                    status = "skipped"
                    status_char = "-"
                else:
                    status = "pending"
                    status_char = " "

                exempt_cat = None
                exempt_match = exempt_re.search(task_desc)
                if exempt_match:
                    exempt_cat = exempt_match.group(1).lower()
                    task_desc = exempt_re.sub("", task_desc).strip()

                commit_sha = None
                sha_match = task_sha_re.search(task_desc)
                if sha_match:
                    commit_sha = sha_match.group(1) or sha_match.group(2) or sha_match.group(3)
                    clean_desc = task_desc[: sha_match.start()].strip()
                else:
                    clean_desc = task_desc

                clean_desc = re.sub(
                    r"\s*\[checkpoint:[^\]]+\]\s*$",
                    "",
                    clean_desc,
                    flags=re.IGNORECASE,
                ).strip()
                clean_desc = re.sub(r"\s+", " ", clean_desc).strip()

                task_num = len(current_phase.tasks) + 1
                is_cp = is_checkpoint_task(clean_desc)

                task_info = TaskInfo(
                    task_num=task_num,
                    description=clean_desc,
                    status=status,
                    status_char=status_char,
                    is_checkpoint=is_cp,
                    commit_sha=commit_sha,
                    exempt=exempt_cat,
                    subtasks=[],
                    raw_line=line.strip(),
                )
                current_phase.tasks.append(task_info)

    # Compute is_complete for each phase
    for phase in phases.values():
        phase.is_complete = bool(phase.checkpoint_sha) or (
            len(phase.tasks) > 0 and all(t.status in ("complete", "skipped") for t in phase.tasks)
        )

    return phases


def get_active_phase(
    phases: Dict[int, PhaseInfo],
    target_phase: Optional[int] = None,
) -> Optional[PhaseInfo]:
    """Resolves target phase or the first incomplete phase from parsed plan."""
    if target_phase is not None:
        return phases.get(target_phase)
    for num in sorted(phases.keys()):
        if not phases[num].is_complete:
            return phases[num]
    return None


def get_pending_tasks(phase: PhaseInfo) -> List[TaskInfo]:
    """Returns list of pending ([ ]) or in-progress ([~]) tasks for a phase."""
    return [t for t in phase.tasks if t.status in ("pending", "in_progress")]


# ---------------------------------------------------------------------------
# Subprocess Protocol & Command Construction
# ---------------------------------------------------------------------------

def generate_turn_prompt(
    track: str,
    phase_num: int,
    task_num: int,
    mode: str = "plan",
    cwd: Optional[Path] = None,
) -> str:
    """Invokes scripts/agent/generate-prompt.py via subprocess to obtain turn prompt."""
    work_dir = cwd or PROJECT_ROOT
    gen_script = work_dir / "scripts" / "agent" / "generate-prompt.py"
    if not gen_script.exists():
        gen_script = PROJECT_ROOT / "scripts" / "agent" / "generate-prompt.py"

    mode_flag = f"--{mode.lstrip('-')}"
    cmd = [
        sys.executable,
        str(gen_script),
        str(track),
        str(phase_num),
        str(task_num),
        mode_flag,
    ]

    res = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=work_dir,
    )
    if res.returncode != 0:
        error_msg = res.stderr.strip() or res.stdout.strip() or f"generate-prompt.py exited with code {res.returncode}"
        raise ProcessExecutionError(f"generate-prompt.py failed: {error_msg}")

    return res.stdout.strip()


def build_agy_command(
    mode: str,
    model: str,
    extra_flags: Optional[List[str]] = None,
) -> List[str]:
    """Builds agy CLI command ensuring configuration flags strictly precede --print."""
    cmd = ["agy", "--mode", mode, "--model", model, "--dangerously-skip-permissions"]
    if extra_flags:
        cmd.extend(extra_flags)
    cmd.append("--print")
    return cmd


def parse_timeout(timeout_val: Union[str, float, int]) -> float:
    """Parses timeout string (e.g. '15m', '900s', '900') into seconds as float."""
    if isinstance(timeout_val, (int, float)):
        return float(timeout_val)
    val_str = str(timeout_val).strip().lower()
    if val_str.endswith("m"):
        return float(val_str[:-1]) * 60.0
    elif val_str.endswith("s"):
        return float(val_str[:-1])
    elif val_str.endswith("h"):
        return float(val_str[:-1]) * 3600.0
    return float(val_str)


def _terminate_process_group(pid: int, proc: Optional[subprocess.Popen] = None) -> None:
    """Sends SIGTERM followed by SIGKILL to the child process group."""
    try:
        pgid = os.getpgid(pid)
    except (ProcessLookupError, OSError):
        pgid = pid

    try:
        os.killpg(pgid, signal.SIGTERM)
    except (ProcessLookupError, OSError):
        return

    if proc is not None:
        try:
            proc.wait(timeout=2.0)
        except (subprocess.TimeoutExpired, Exception):
            try:
                os.killpg(pgid, signal.SIGKILL)
            except (ProcessLookupError, OSError):
                pass


def run_agy_turn(
    prompt: str,
    mode: str = "plan",
    model: str = "gemini-3.8-flash-high",
    timeout: float = 900.0,
    cwd: Optional[Path] = None,
    log_file: Optional[Path] = None,
) -> Tuple[int, str, str]:
    """Runs agy subprocess turn in a dedicated process group with stdin prompt delivery."""
    cmd = build_agy_command(mode=mode, model=model)
    work_dir = cwd or PROJECT_ROOT

    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=work_dir,
        start_new_session=True,
    )

    try:
        stdout, stderr = proc.communicate(input=prompt, timeout=timeout)
    except subprocess.TimeoutExpired:
        _terminate_process_group(proc.pid, proc)
        raise ProcessExecutionError(f"Turn timed out after {timeout}s")
    except KeyboardInterrupt:
        _terminate_process_group(proc.pid, proc)
        raise

    if log_file:
        try:
            log_path = Path(log_file)
            log_path.parent.mkdir(parents=True, exist_ok=True)
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(f"=== AGY TURN [{mode}] [{model}] ===\n")
                f.write(f"PROMPT:\n{prompt}\n")
                f.write(f"STDOUT:\n{stdout}\n")
                f.write(f"STDERR:\n{stderr}\n")
                f.write(f"EXIT CODE: {proc.returncode}\n\n")
        except OSError:
            pass

    return proc.returncode, stdout, stderr


# ---------------------------------------------------------------------------
# Caching & Invariant Verification
# ---------------------------------------------------------------------------

def check_plan_cache(
    track_dir: Path,
    phase_num: int,
    task_num: int,
    force_plan: bool = False,
) -> Tuple[bool, Path]:
    """Checks if phase-X-task-Y-plan.md exists and is non-empty. Returns (is_cached, plan_path)."""
    plan_path = Path(track_dir) / f"phase-{phase_num}-task-{task_num}-plan.md"
    if force_plan:
        return False, plan_path
    if plan_path.exists() and plan_path.stat().st_size > 0:
        return True, plan_path
    return False, plan_path


def _is_production_file(filepath: str) -> bool:
    """Returns True if file modification violates planning turn purity."""
    clean_p = filepath.strip()
    if " -> " in clean_p:
        clean_p = clean_p.split(" -> ")[-1].strip()
    clean_p = clean_p.replace("\\", "/")

    # Allowed metadata and conductor directories
    if clean_p.startswith("conductor/") or clean_p.startswith(".conductor/"):
        return False
    if clean_p.startswith(".gemini/") or clean_p.startswith(".claude/") or clean_p.startswith(".agents/"):
        return False

    prod_prefixes = (
        "app/", "lib/", "components/", "supabase/", "hooks/", "types/",
        "public/", "scripts/", "pages/", "e2e/", "test/", "tests/", "styles/", "src/"
    )
    if clean_p.startswith(prod_prefixes):
        return True

    prod_extensions = (".ts", ".tsx", ".js", ".jsx", ".py", ".sql", ".css", ".html")
    if any(clean_p.endswith(ext) for ext in prod_extensions):
        return True
    if clean_p in ("package.json", "package-lock.json", "tsconfig.json"):
        return True

    return False


def assert_post_plan_invariants(
    track_dir: Path,
    phase_num: int,
    task_num: int,
    cwd: Optional[Path] = None,
) -> None:
    """Verifies plan file was created and porcelain git status contains 0 production changes."""
    plan_path = Path(track_dir) / f"phase-{phase_num}-task-{task_num}-plan.md"
    if not plan_path.exists() or plan_path.stat().st_size == 0:
        raise PlanInvariantError(
            f"Tier 1 plan blueprint missing or empty at {plan_path}"
        )

    res = subprocess.run(
        ["git", "status", "--porcelain"],
        capture_output=True,
        text=True,
        cwd=cwd or PROJECT_ROOT,
    )
    if res.returncode != 0:
        raise ProcessExecutionError(f"git status failed: {res.stderr}")

    violations = []
    for line in res.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        file_part = line[2:].strip()
        if " -> " in file_part:
            file_part = file_part.split(" -> ")[-1].strip()
        if _is_production_file(file_part):
            violations.append(file_part)

    if violations:
        raise PlanInvariantError(
            f"Post-plan invariant violation: modified application code detected ({', '.join(violations)}) during planning turn."
        )


def _is_red_task_production_violation(filepath: str) -> bool:
    """Returns True if a modified file in Red phase belongs to production application code (violating test purity)."""
    clean_p = filepath.strip()
    if " -> " in clean_p:
        clean_p = clean_p.split(" -> ")[-1].strip()
    clean_p = clean_p.replace("\\", "/")

    # Allowed in Red phase: conductor and agent metadata directories
    if clean_p.startswith(("conductor/", ".conductor/", ".gemini/", ".agents/", ".claude/")):
        return False

    # Allowed in Red phase: test directories and test file naming conventions
    if any(seg in clean_p for seg in ("__tests__/", "tests/", "test/", "e2e/")):
        return False
    test_suffixes = (".test.ts", ".test.tsx", ".test.js", ".test.jsx", ".spec.ts", ".spec.tsx")
    if clean_p.endswith(test_suffixes):
        return False
    basename = Path(clean_p).name
    if basename.startswith("test_") and clean_p.endswith(".py"):
        return False

    # Production violation prefixes, config files, and code extensions
    prod_prefixes = (
        "app/", "lib/", "components/", "supabase/", "hooks/",
        "types/", "public/", "scripts/", "src/",
    )
    if clean_p.startswith(prod_prefixes):
        return True
    if clean_p in ("package.json", "package-lock.json", "tsconfig.json"):
        return True
    prod_extensions = (".ts", ".tsx", ".js", ".jsx", ".py", ".sql", ".css")
    if any(clean_p.endswith(ext) for ext in prod_extensions):
        return True

    return False


def check_working_tree_cleanliness(
    cwd: Optional[Path] = None,
) -> Tuple[bool, List[str]]:
    """Runs git status --porcelain. Returns (is_clean, dirty_files)."""
    res = subprocess.run(
        ["git", "status", "--porcelain"],
        capture_output=True,
        text=True,
        cwd=cwd or PROJECT_ROOT,
    )
    if res.returncode != 0:
        raise ProcessExecutionError(f"git status failed: {res.stderr}")

    dirty_files: List[str] = []
    for line in res.stdout.splitlines():
        if not line.strip():
            continue
        file_part = line[2:].strip()
        if " -> " in file_part:
            file_part = file_part.split(" -> ")[-1].strip()
        if file_part:
            dirty_files.append(file_part)

    return len(dirty_files) == 0, dirty_files


def dispatch_recovery_turn(
    track_name: str,
    phase_num: int,
    task_num: int,
    exec_model: str = "gemini-3.8-flash-medium",
    timeout: float = 900.0,
    cwd: Optional[Path] = None,
) -> bool:
    """Dispatches a single recovery turn via generate-prompt.py --recovery to clean up uncommitted work."""
    work_dir = cwd or PROJECT_ROOT
    track_dir = resolve_track_dir(track_name) or (work_dir / "conductor" / "tracks" / track_name).resolve()
    log_file = track_dir / "logs" / f"phase-{phase_num}-task-{task_num}-recovery.log"

    prompt = generate_turn_prompt(
        track=track_name,
        phase_num=phase_num,
        task_num=task_num,
        mode="recovery",
        cwd=work_dir,
    )
    ret, _stdout, stderr = run_agy_turn(
        prompt=prompt,
        mode="auto",
        model=exec_model,
        timeout=timeout,
        cwd=work_dir,
        log_file=log_file,
    )
    if ret != 0:
        raise ProcessExecutionError(f"Recovery turn failed with exit code {ret}: {stderr.strip()}")
    return True


_SYNTAX_ERROR_PATTERNS = [
    re.compile(r"\bSyntaxError\b", re.IGNORECASE),
    re.compile(r"Cannot find module\b", re.IGNORECASE),
    re.compile(r"\bReferenceError\b", re.IGNORECASE),
    re.compile(r"\bImportError\b", re.IGNORECASE),
    re.compile(r"\bModuleNotFoundError\b", re.IGNORECASE),
    re.compile(r"^ERROR:\s+", re.MULTILINE),
    re.compile(r"\bTS\d{4}:", re.IGNORECASE),
]

_ASSERTION_PATTERNS = [
    re.compile(r"expect\(", re.IGNORECASE),
    re.compile(r"\bExpected:\s+", re.IGNORECASE),
    re.compile(r"\bReceived:\s+", re.IGNORECASE),
    re.compile(r"\bAssertionError\b", re.IGNORECASE),
    re.compile(r"^FAIL:\s+", re.MULTILINE),
    re.compile(r"FAILED \(failures=", re.IGNORECASE),
    re.compile(r"\bassert\s+", re.IGNORECASE),
]


def parse_test_failure_markers(
    output: str,
    runner_hint: Optional[str] = None,
) -> Tuple[bool, str]:
    """Parses test runner stdout/stderr for assertion failure markers vs syntax/runtime errors.

    Returns:
        (is_valid_assertion_failure: bool, reason: str)
    """
    _ = runner_hint  # Reserved for runner-specific heuristics
    for pattern in _SYNTAX_ERROR_PATTERNS:
        match = pattern.search(output)
        if match:
            return False, f"Syntax/module load error detected: {match.group(0)}"

    for pattern in _ASSERTION_PATTERNS:
        match = pattern.search(output)
        if match:
            return True, f"Assertion failure detected: {match.group(0)}"

    return False, "No assertion failure markers detected in test output"


def verify_red_task(
    test_cmd: str,
    base_sha: str,
    head_sha: str = "HEAD",
    cwd: Optional[Path] = None,
) -> bool:
    """Performs dual-check verification for Red tasks:
    1. Test command exits non-zero.
    2. Output contains assertion failure markers, not syntax/import errors.
    3. Zero production files were modified between base_sha and head_sha.
    Raises SupervisorInvariantError on any violation.
    """
    work_dir = cwd or PROJECT_ROOT
    cmd = test_cmd if isinstance(test_cmd, list) else test_cmd.split()
    res = subprocess.run(cmd, capture_output=True, text=True, cwd=work_dir)
    if res.returncode == 0:
        raise SupervisorInvariantError(
            f"Red task test unexpectedly passed (exit code 0): {test_cmd}"
        )

    combined_output = (res.stdout or "") + "\n" + (res.stderr or "")
    is_valid, reason = parse_test_failure_markers(combined_output)
    if not is_valid:
        raise SupervisorInvariantError(
            f"Red task failed due to syntax/module error, not assertion failure: {reason}"
        )

    diff_res = subprocess.run(
        ["git", "diff", "--name-only", base_sha, head_sha],
        capture_output=True,
        text=True,
        cwd=work_dir,
    )
    if diff_res.returncode != 0:
        raise ProcessExecutionError(f"git diff failed: {diff_res.stderr}")

    for line in diff_res.stdout.splitlines():
        f = line.strip()
        if not f:
            continue
        if _is_red_task_production_violation(f):
            raise SupervisorInvariantError(f"Red task modified production code: {f}")

    return True


def verify_green_task(
    test_cmd: str,
    cwd: Optional[Path] = None,
    type_check_cmd: str = "npm run type-check",
) -> bool:
    """Performs verification for Green tasks:
    1. Test command exits 0.
    2. Type-check command exits 0.
    Raises SupervisorInvariantError if either fails.
    """
    work_dir = cwd or PROJECT_ROOT
    cmd = test_cmd if isinstance(test_cmd, list) else test_cmd.split()
    res = subprocess.run(cmd, capture_output=True, text=True, cwd=work_dir)
    if res.returncode != 0:
        raise SupervisorInvariantError(
            f"Green task test command failed (exit code {res.returncode}): {res.stderr or res.stdout}"
        )

    tc_cmd = type_check_cmd if isinstance(type_check_cmd, list) else type_check_cmd.split()
    tc_res = subprocess.run(tc_cmd, capture_output=True, text=True, cwd=work_dir)
    if tc_res.returncode != 0:
        raise SupervisorInvariantError(
            f"Green task type-check failed (exit code {tc_res.returncode}): {tc_res.stderr or tc_res.stdout}"
        )

    return True


def verify_exempt_task(
    exempt_category: str,
    base_sha: Optional[str] = None,
    head_sha: str = "HEAD",
    cwd: Optional[Path] = None,
) -> bool:
    """Executes category-specific invariant verification for exempt tasks:
    - 'ui' / 'styling': npm run build (exit 0)
    - 'infra' / 'scripts': npm run lint (exit 0)
    - 'types': npm run type-check (exit 0)
    - 'docs': git diff verifies only .md files modified and non-empty.
    Raises SupervisorInvariantError on violation.
    """
    work_dir = cwd or PROJECT_ROOT
    cat = exempt_category.lower().strip()

    if cat in ("ui", "styling"):
        res = subprocess.run(["npm", "run", "build"], capture_output=True, text=True, cwd=work_dir)
        if res.returncode != 0:
            raise SupervisorInvariantError(
                f"Exempt UI task build failed with exit code {res.returncode}"
            )
    elif cat in ("infra", "scripts"):
        res = subprocess.run(["npm", "run", "lint"], capture_output=True, text=True, cwd=work_dir)
        if res.returncode != 0:
            raise SupervisorInvariantError(
                f"Exempt infra/scripts task lint failed with exit code {res.returncode}"
            )
    elif cat == "types":
        res = subprocess.run(["npm", "run", "type-check"], capture_output=True, text=True, cwd=work_dir)
        if res.returncode != 0:
            raise SupervisorInvariantError(
                f"Exempt types task type-check failed with exit code {res.returncode}"
            )
    elif cat == "docs":
        base = base_sha or "HEAD~1"
        res = subprocess.run(
            ["git", "diff", "--name-only", base, head_sha],
            capture_output=True,
            text=True,
            cwd=work_dir,
        )
        if res.returncode != 0:
            raise ProcessExecutionError(f"git diff failed: {res.stderr}")
        diff_files = [line.strip() for line in res.stdout.splitlines() if line.strip()]
        for f in diff_files:
            if not (f.endswith(".md") or f.endswith(".markdown")):
                raise SupervisorInvariantError(
                    f"Exempt docs task modified non-markdown file: {f}"
                )
        for f in diff_files:
            target_path = work_dir / f
            if not target_path.exists() or target_path.stat().st_size == 0:
                raise SupervisorInvariantError(
                    f"Exempt docs task created empty file or file missing: {f}"
                )
    else:
        raise SupervisorInvariantError(f"Unknown exempt category: {exempt_category}")

    return True


_CONVENTIONAL_COMMIT_RE = re.compile(
    r"^(feat|fix|test|refactor|perf|style|chore|docs|types|conductor)(\([a-zA-Z0-9_\-./]+\))?!?: .+$"
)


def audit_git_commit_and_notes(
    task: TaskInfo,
    commit_sha: str,
    plan_path: Path,
    cwd: Optional[Path] = None,
) -> bool:
    """Audits git commit message, git notes metadata, plan.md task mark, and plan commit.
    Raises SupervisorInvariantError on violation.
    """
    work_dir = cwd or PROJECT_ROOT

    log_res = subprocess.run(
        ["git", "log", "-1", "--format=%B", commit_sha],
        capture_output=True,
        text=True,
        cwd=work_dir,
    )
    if log_res.returncode != 0:
        raise ProcessExecutionError(
            f"git log failed for commit {commit_sha}: {log_res.stderr}"
        )
    msg = log_res.stdout.strip()
    first_line = msg.splitlines()[0].strip() if msg else ""
    if not _CONVENTIONAL_COMMIT_RE.match(first_line):
        raise SupervisorInvariantError(
            f"Commit message does not match Conventional Commit format: '{msg}'"
        )

    notes_res = subprocess.run(
        ["git", "notes", "show", commit_sha],
        capture_output=True,
        text=True,
        cwd=work_dir,
    )
    if notes_res.returncode != 0:
        raise SupervisorInvariantError(
            f"Git notes missing on commit {commit_sha}: {notes_res.stderr}"
        )
    note_text = notes_res.stdout
    for field_name in ("Task:", "Summary:", "Files:", "Rationale:"):
        if field_name not in note_text:
            raise SupervisorInvariantError(
                f"Git note missing required field: {field_name.rstrip(':')}"
            )

    if not plan_path.exists():
        raise SupervisorInvariantError(f"plan.md not found at {plan_path}")
    plan_content = plan_path.read_text(encoding="utf-8")
    short_sha = commit_sha[:7]
    has_marked_task = any(
        re.match(r"^\s*-\s*\[[xX]\]\s+", line) and short_sha in line
        for line in plan_content.splitlines()
    )
    if not has_marked_task:
        raise SupervisorInvariantError(
            f"plan.md not updated with [x] and commit SHA {short_sha} for task '{task.description}'"
        )

    plan_log_res = subprocess.run(
        ["git", "log", "-1", "--pretty=%B", "--", str(plan_path)],
        capture_output=True,
        text=True,
        cwd=work_dir,
    )
    if plan_log_res.returncode != 0:
        raise ProcessExecutionError(
            f"git log for plan.md failed: {plan_log_res.stderr}"
        )
    plan_commit = plan_log_res.stdout.strip()
    if "conductor(plan)" not in plan_commit:
        raise SupervisorInvariantError(
            f"Missing conductor(plan) commit for plan update. Latest commit: '{plan_commit}'"
        )

    return True


def verify_task_execution(
    track_name: str,
    phase_num: int,
    task_num: int,
    base_sha: Optional[str] = None,
    cwd: Optional[Path] = None,
) -> bool:
    """High-level supervisor router: resolves task metadata and dispatches red, green, or exempt verification."""
    work_dir = cwd or PROJECT_ROOT
    track_dir = resolve_track_dir(track_name) or (work_dir / "conductor" / "tracks" / track_name).resolve()
    phases = parse_track_plan(track_dir)
    phase = phases.get(phase_num)
    task = next((t for t in phase.tasks if t.task_num == task_num), None) if phase else None
    if task is None:
        raise SupervisorInvariantError(
            f"Task {task_num} in Phase {phase_num} not found in {track_dir / 'plan.md'}"
        )

    if task.exempt:
        return verify_exempt_task(task.exempt, base_sha=base_sha, cwd=work_dir)

    desc_lower = task.description.lower()
    if "red phase" in desc_lower or desc_lower.startswith("test("):
        return verify_red_task(
            test_cmd="npm test",
            base_sha=base_sha or "HEAD~1",
            cwd=work_dir,
        )

    return verify_green_task(test_cmd="npm test", cwd=work_dir)


# ---------------------------------------------------------------------------
# Tier 1 Planning Turn Dispatcher
# ---------------------------------------------------------------------------

def dispatch_tier1_planning(
    track_name: str,
    phase_num: int,
    task_num: int,
    plan_model: str = "gemini-3.8-flash-high",
    force_plan: bool = False,
    timeout: float = 900.0,
    cwd: Optional[Path] = None,
) -> bool:
    """Coordinates Tier 1 turn: cache check -> prompt gen -> agy dispatch -> invariant audit."""
    work_dir = cwd or PROJECT_ROOT
    track_dir = resolve_track_dir(track_name)
    if not track_dir:
        track_dir = (work_dir / "conductor" / "tracks" / track_name).resolve()

    cached, plan_path = check_plan_cache(
        track_dir=track_dir,
        phase_num=phase_num,
        task_num=task_num,
        force_plan=force_plan,
    )
    if cached:
        return True

    prompt = generate_turn_prompt(
        track=track_name,
        phase_num=phase_num,
        task_num=task_num,
        mode="plan",
        cwd=work_dir,
    )

    log_file = track_dir / "logs" / f"phase-{phase_num}-task-{task_num}-plan.log"
    ret, stdout, stderr = run_agy_turn(
        prompt=prompt,
        mode="plan",
        model=plan_model,
        timeout=timeout,
        cwd=work_dir,
        log_file=log_file,
    )
    if ret != 0:
        raise ProcessExecutionError(
            f"Tier 1 planning turn failed with exit code {ret}: {stderr.strip()}"
        )

    assert_post_plan_invariants(
        track_dir=track_dir,
        phase_num=phase_num,
        task_num=task_num,
        cwd=work_dir,
    )
    return True


# ---------------------------------------------------------------------------
# Tier 2 Execution Turn Dispatcher
# ---------------------------------------------------------------------------

def dispatch_tier2_execution(
    track_name: str,
    phase_num: int,
    task_num: int,
    exec_model: str = "gemini-3.8-flash-medium",
    auto_recover: bool = False,
    timeout: float = 900.0,
    cwd: Optional[Path] = None,
) -> bool:
    """Coordinates Tier 2 execution turn:
    1. Captures base HEAD SHA.
    2. Generates execution prompt via generate-prompt.py --exec.
    3. Dispatches agy --mode auto turn.
    4. Checks working tree cleanliness (invoking recovery if --auto-recover).
    5. Audits active task verification (Red, Green, or Exempt).
    6. Audits git commit, notes, and plan.md update.
    Returns True on success; raises ConductorAutoError on failure.
    """
    work_dir = cwd or PROJECT_ROOT
    track_dir = resolve_track_dir(track_name) or (work_dir / "conductor" / "tracks" / track_name).resolve()
    log_file = track_dir / "logs" / f"phase-{phase_num}-task-{task_num}-exec.log"

    head_res = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        cwd=work_dir,
    )
    base_sha = head_res.stdout.strip() if head_res.returncode == 0 else "HEAD~1"

    prompt = generate_turn_prompt(
        track=track_name,
        phase_num=phase_num,
        task_num=task_num,
        mode="exec",
        cwd=work_dir,
    )

    ret, _stdout, stderr = run_agy_turn(
        prompt=prompt,
        mode="auto",
        model=exec_model,
        timeout=timeout,
        cwd=work_dir,
        log_file=log_file,
    )
    if ret != 0:
        raise ProcessExecutionError(
            f"Tier 2 execution turn failed with exit code {ret}: {stderr.strip()}"
        )

    is_clean, dirty_files = check_working_tree_cleanliness(cwd=work_dir)
    if not is_clean:
        if auto_recover:
            dispatch_recovery_turn(
                track_name=track_name,
                phase_num=phase_num,
                task_num=task_num,
                exec_model=exec_model,
                timeout=timeout,
                cwd=work_dir,
            )
            is_clean, dirty_files = check_working_tree_cleanliness(cwd=work_dir)
            if not is_clean:
                raise GitTreeDirtyError(
                    f"Working tree remains dirty after recovery turn: {', '.join(dirty_files)}"
                )
        else:
            raise GitTreeDirtyError(
                f"Working tree contains uncommitted changes ({', '.join(dirty_files)}) and --auto-recover is disabled."
            )

    verify_task_execution(
        track_name=track_name,
        phase_num=phase_num,
        task_num=task_num,
        base_sha=base_sha,
        cwd=work_dir,
    )

    phases = parse_track_plan(track_dir)
    plan_path = track_dir / "plan.md"
    phase = phases.get(phase_num)
    task = next((t for t in phase.tasks if t.task_num == task_num), None) if phase else None
    if task is None:
        task = TaskInfo(
            task_num=task_num,
            description=f"Phase {phase_num} Task {task_num}",
            status="complete",
            status_char="x",
            is_checkpoint=False,
        )

    commit_sha = task.commit_sha
    if not commit_sha:
        sha_res = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            cwd=work_dir,
        )
        commit_sha = sha_res.stdout.strip() if sha_res.returncode == 0 else "HEAD"

    audit_git_commit_and_notes(
        task=task,
        commit_sha=commit_sha,
        plan_path=plan_path,
        cwd=work_dir,
    )
    return True


# ---------------------------------------------------------------------------
# CLI Argument Parser & Entrypoint
# ---------------------------------------------------------------------------

def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    """Configures and parses CLI arguments."""
    parser = argparse.ArgumentParser(
        description="Autonomous multi-task track execution runner for Conductor tracks."
    )
    parser.add_argument(
        "track",
        nargs="?",
        default=None,
        help="Track name or path (defaults to active track from tracks.md).",
    )
    parser.add_argument(
        "--phase",
        type=int,
        default=None,
        help="Target phase number (defaults to first incomplete phase).",
    )
    parser.add_argument(
        "--task",
        type=int,
        default=None,
        help="Target task number within phase.",
    )
    parser.add_argument(
        "--force-plan",
        action="store_true",
        default=False,
        help="Force re-generation of plan blueprint even if cached.",
    )
    parser.add_argument(
        "--timeout",
        default="900s",
        help="Turn timeout duration (e.g. 15m, 900s, 900; default: 900s).",
    )
    parser.add_argument(
        "--plan-model",
        default="gemini-3.8-flash-high",
        help="Model to use for Tier 1 planning (default: gemini-3.8-flash-high).",
    )
    parser.add_argument(
        "--exec-model",
        default="gemini-3.8-flash-medium",
        help="Model to use for Tier 2 execution (default: gemini-3.8-flash-medium).",
    )
    parser.add_argument(
        "--review-model",
        default="gemini-3.8-flash-high",
        help="Model to use for Gate 2 review (default: gemini-3.8-flash-high).",
    )
    parser.add_argument(
        "--no-review",
        action="store_true",
        default=False,
        help="Skip Gate 2 review step at phase boundary.",
    )
    parser.add_argument(
        "--auto-recover",
        action="store_true",
        default=False,
        help="Enable automated single-turn recovery prompt on uncommitted changes.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Simulate execution without running agy turns.",
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    """Main CLI entrypoint for conductor-auto."""
    args = parse_args(argv)
    track_name = args.track or get_active_track()
    if not track_name:
        print("Error: No active track found and no track specified.", file=sys.stderr)
        return 1

    track_dir = resolve_track_dir(track_name)
    if not track_dir or not (track_dir / "plan.md").exists():
        print(f"Error: Track plan not found at {track_dir / 'plan.md' if track_dir else track_name}", file=sys.stderr)
        return 1

    phases = parse_track_plan(track_dir)
    active_phase = get_active_phase(phases, target_phase=args.phase)
    if not active_phase:
        print(f"All phases complete or phase {args.phase} not found in track {track_name}.")
        return 0

    pending_tasks = get_pending_tasks(active_phase)
    if args.task:
        pending_tasks = [t for t in pending_tasks if t.task_num == args.task]

    if not pending_tasks:
        print(f"No pending tasks in phase {active_phase.phase_num}.")
        return 0

    timeout_sec = parse_timeout(args.timeout)

    for task in pending_tasks:
        if task.is_checkpoint:
            print(f"Phase {active_phase.phase_num} reached checkpoint task {task.task_num}. Stopping planning tier.")
            break

        print(f"Dispatching Tier 1 planning for Phase {active_phase.phase_num} Task {task.task_num}: {task.description}")
        if args.dry_run:
            print(f"[DRY-RUN] Would dispatch Tier 1 planning with model {args.plan_model}")
            print(f"[DRY-RUN] Would dispatch Tier 2 execution with model {args.exec_model}")
            continue

        try:
            dispatch_tier1_planning(
                track_name=track_name,
                phase_num=active_phase.phase_num,
                task_num=task.task_num,
                plan_model=args.plan_model,
                force_plan=args.force_plan,
                timeout=timeout_sec,
            )
            print(f"Dispatching Tier 2 execution for Phase {active_phase.phase_num} Task {task.task_num}: {task.description}")
            dispatch_tier2_execution(
                track_name=track_name,
                phase_num=active_phase.phase_num,
                task_num=task.task_num,
                exec_model=args.exec_model,
                auto_recover=args.auto_recover,
                timeout=timeout_sec,
            )
        except ConductorAutoError as err:
            print(f"Conductor Auto Error: {err}", file=sys.stderr)
            return 1
        except Exception as err:
            print(f"Unexpected error: {err}", file=sys.stderr)
            return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
