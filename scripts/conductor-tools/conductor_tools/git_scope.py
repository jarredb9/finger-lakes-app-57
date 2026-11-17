"""Git workspace discovery, diff/cleanliness inspection, audit, and clipboard adapters."""

from __future__ import annotations

import base64
from pathlib import Path
import re
import subprocess
import sys
from typing import Optional, Sequence, Union

from conductor_tools.models import (
    ConductorError,
    PhaseInfo,
    ProcessExecutionError,
    SupervisorInvariantError,
    TaskInfo,
)
from conductor_tools.parser import parse_plan_file
from conductor_tools.profile import PathRules, PlanningProfile, SupervisorProfile

_HEX_SHA_RE = re.compile(r"^[a-f0-9]{7,40}$", re.IGNORECASE)
_MARKED_TASK_LINE_RE = re.compile(r"^\s*-\s*\[x\]", re.IGNORECASE)
_CLIPBOARD_TOOLS: tuple[list[str], ...] = (
    ["xclip", "-selection", "clipboard"],
    ["wl-copy"],
    ["pbcopy"],
    ["xsel", "--clipboard", "--input"],
)


# ---------------------------------------------------------------------------
# Workspace & Track Root Discovery
# ---------------------------------------------------------------------------


def _walk_until_git_boundary(
    start_dir: Path,
    conductor_dir_name: str,
) -> tuple[Optional[Path], bool]:
    """Walk upward from `start_dir` for `conductor_dir_name/`, halting at any `.git` marker."""
    for directory in (start_dir, *start_dir.parents):
        if (directory / conductor_dir_name).is_dir():
            return (directory, True)
        if (directory / ".git").exists():
            return (None, True)
    return (None, False)


def resolve_repo_root(
    repo_root: Optional[Union[str, Path]] = None,
    *,
    cwd: Optional[Path] = None,
    script_path: Optional[Path] = None,
    conductor_dir_name: str = "conductor",
) -> Path:
    """Resolve the repository root containing `conductor_dir_name/`, respecting `.git` boundaries."""
    if repo_root is not None:
        if isinstance(repo_root, str) and not repo_root.strip():
            raise ConductorError(f"Invalid repository root {repo_root!r}: empty path")
        candidate = Path(repo_root).expanduser().resolve()
        if candidate.is_dir() and (candidate / conductor_dir_name).is_dir():
            return candidate
        raise ConductorError(
            f"Invalid repository root '{candidate}': missing directory or '{conductor_dir_name}/'"
        )

    start_cwd = (Path(cwd) if cwd is not None else Path.cwd()).resolve()
    found, cwd_in_git = _walk_until_git_boundary(start_cwd, conductor_dir_name)
    if found is not None:
        return found

    if not cwd_in_git and script_path is not None:
        resolved_script = Path(script_path).resolve()
        script_start = resolved_script if resolved_script.is_dir() else resolved_script.parent
        found_from_script, _ = _walk_until_git_boundary(script_start, conductor_dir_name)
        if found_from_script is not None:
            return found_from_script

    raise ConductorError(
        f"Could not locate repository root containing '{conductor_dir_name}/' from '{start_cwd}'"
    )


def resolve_track_dir(
    track_name: Optional[str],
    repo_root: Path,
    planning: Optional[PlanningProfile] = None,
) -> Optional[Path]:
    """Resolve a track directory from direct path, active tracks dir, or archive dir."""
    if not track_name:
        return None

    profile = planning if planning is not None else PlanningProfile()
    root = Path(repo_root).resolve()

    raw_path = Path(track_name)
    direct = raw_path.resolve() if raw_path.is_absolute() else (root / raw_path).resolve()
    if direct.is_dir() and (direct / "plan.md").is_file():
        return direct

    active_candidate = (root / profile.tracks_dir / track_name).resolve()
    if active_candidate.is_dir():
        return active_candidate

    archive_candidate = (root / profile.archive_dir / track_name).resolve()
    if archive_candidate.is_dir():
        return archive_candidate

    return active_candidate


def derive_scope(track_name: str) -> str:
    """Derive a Conventional Commit scope from a track directory or identifier."""
    if not track_name:
        return "core"
    scope = Path(track_name).name.split("_")[0].split("-")[0].strip()
    return scope if scope else "core"


def rel_to_root(path: Path, repo_root: Path) -> str:
    """Return `path` relative to `repo_root` in POSIX format, or `str(path)` if outside."""
    try:
        rel = Path(path).resolve().relative_to(Path(repo_root).resolve())
        return "." if str(rel) == "." else rel.as_posix()
    except ValueError:
        return str(path)


# ---------------------------------------------------------------------------
# Commit Verification & Phase SHA Resolution
# ---------------------------------------------------------------------------


def verify_git_commit(rev: str, cwd: Path) -> Optional[str]:
    """Verify `rev` resolves to a commit in `cwd` and return its 7-char short SHA."""
    if not rev or not rev.strip():
        return None
    try:
        res = subprocess.run(
            ["git", "rev-parse", "--verify", "--quiet", "--short=7", f"{rev.strip()}^{{commit}}"],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=3,
        )
        if res.returncode == 0:
            short_sha = res.stdout.strip()
            if short_sha:
                return short_sha
    except (OSError, subprocess.SubprocessError):
        return None
    return None


def _resolve_last_task_sha(
    tasks: Sequence[TaskInfo],
    cwd: Path,
    has_git: bool,
    verify_in_git: bool = True,
) -> Optional[str]:
    """Return the most recent task commit SHA in `tasks`, verifying against git when requested."""
    for task in reversed(tasks):
        sha = task.commit_sha
        if not sha:
            continue
        if verify_in_git and has_git:
            verified = verify_git_commit(sha, cwd)
            if verified is not None:
                return verified
        elif not verify_in_git or not has_git:
            return sha[:7]
    return None


def _resolve_first_task_parent_sha(phase: PhaseInfo, cwd: Path) -> Optional[str]:
    """Return the verified parent SHA (`<sha>~1`) of the first task with a commit SHA."""
    for task in phase.tasks:
        if task.commit_sha:
            return verify_git_commit(f"{task.commit_sha}~1", cwd)
    return None


def resolve_phase_baseline_sha(
    phases: dict[int, PhaseInfo],
    phase_num: Optional[int],
    cwd: Path,
) -> Optional[str]:
    """Resolve the baseline commit SHA at the start of `phase_num`."""
    if phase_num is None or phase_num not in phases:
        return None

    has_git = verify_git_commit("HEAD", cwd) is not None

    for prev_num in reversed([p for p in sorted(phases.keys()) if p < phase_num]):
        prev_phase = phases[prev_num]

        rf_sha = _resolve_last_task_sha(prev_phase.review_fixes, cwd, has_git)
        if rf_sha:
            return rf_sha

        if prev_phase.checkpoint_sha:
            if has_git:
                verified_cp = verify_git_commit(prev_phase.checkpoint_sha, cwd)
                if verified_cp:
                    return verified_cp
            else:
                return prev_phase.checkpoint_sha[:7]

        task_sha = _resolve_last_task_sha(prev_phase.tasks, cwd, has_git)
        if task_sha:
            return task_sha

    parent_sha = _resolve_first_task_parent_sha(phases[phase_num], cwd)
    if parent_sha:
        return parent_sha

    if has_git:
        for base_ref in ("main", "origin/main"):
            try:
                res = subprocess.run(
                    ["git", "merge-base", "HEAD", base_ref],
                    cwd=str(cwd),
                    capture_output=True,
                    text=True,
                    timeout=3,
                )
                if res.returncode == 0 and res.stdout.strip():
                    verified_mb = verify_git_commit(res.stdout.strip(), cwd)
                    if verified_mb:
                        return verified_mb
            except (OSError, subprocess.SubprocessError):
                continue

    return None


def resolve_phase_end_sha(
    phases: dict[int, PhaseInfo],
    phase_num: Optional[int],
    cwd: Path,
) -> str:
    """Resolve the terminal commit SHA (or `'HEAD'`) for `phase_num`."""
    if phase_num is None or phase_num not in phases:
        return "HEAD"

    phase = phases[phase_num]
    has_git = verify_git_commit("HEAD", cwd) is not None

    # Tier 0: Verified review fixes on this phase
    rf_sha = _resolve_last_task_sha(phase.review_fixes, cwd, has_git)
    if rf_sha:
        return rf_sha

    # Tier 1: Phase checkpoint SHA (verified when in a git repo, else short prefix)
    if phase.checkpoint_sha:
        if has_git:
            verified_cp = verify_git_commit(phase.checkpoint_sha, cwd)
            if verified_cp:
                return verified_cp
        else:
            return phase.checkpoint_sha[:7]

    # Tier 2: Verified task commit SHA in this phase
    task_sha = _resolve_last_task_sha(phase.tasks, cwd, has_git)
    if task_sha:
        return task_sha

    # Tier 3: Next sequential phase's first-task parent baseline (without walking backward < phase_num)
    later_phases = [p for p in sorted(phases.keys()) if p > phase_num]
    if later_phases:
        next_parent = _resolve_first_task_parent_sha(phases[later_phases[0]], cwd)
        if next_parent:
            return next_parent

    # Tier 4: Unverified short SHA fallback
    rf_fallback = _resolve_last_task_sha(phase.review_fixes, cwd, has_git, verify_in_git=False)
    if rf_fallback:
        return rf_fallback
    if phase.checkpoint_sha:
        return phase.checkpoint_sha[:7]
    task_fallback = _resolve_last_task_sha(phase.tasks, cwd, has_git, verify_in_git=False)
    if task_fallback:
        return task_fallback

    # Tier 5: Active phase fallback
    return "HEAD"


# ---------------------------------------------------------------------------
# Path Normalization, Status Cleanliness, Diffs & Commit Helper
# ---------------------------------------------------------------------------


def _strip_matching_quotes(text: str) -> str:
    """Strip matching surrounding single/double quotes or backticks."""
    cleaned = text
    while len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in ("'", '"', "`"):
        cleaned = cleaned[1:-1]
    return cleaned


def normalize_repo_path(filepath: str) -> str:
    """Normalize git status/diff file paths while preserving dot-prefixed metadata dirs."""
    clean = filepath.strip()
    if " -> " in clean:
        clean = clean.split(" -> ")[-1].strip()
    clean = _strip_matching_quotes(clean)
    clean = clean.replace("\\", "/")
    while clean.startswith("./"):
        clean = clean[2:]
    return clean


def is_ephemeral_supervisor_path(
    filepath: str,
    path_rules: Optional[PathRules] = None,
) -> bool:
    """Return True when `filepath` matches any configured ephemeral supervisor artifact pattern."""
    rules = path_rules if path_rules is not None else PathRules()
    clean = normalize_repo_path(filepath)
    if not clean:
        return False
    return any(re.match(pat, clean) for pat in rules.ephemeral_patterns)


def is_supervisor_log_path(
    filepath: str,
    path_rules: Optional[PathRules] = None,
) -> bool:
    """Return True when `filepath` matches any configured supervisor log pattern."""
    rules = path_rules if path_rules is not None else PathRules()
    clean = normalize_repo_path(filepath)
    if not clean:
        return False
    return any(re.match(pat, clean) for pat in rules.log_patterns)


def _run_git(
    args: Sequence[str],
    cwd: Path,
    *,
    error_cls: type[ConductorError] = ProcessExecutionError,
    context: str = "",
) -> subprocess.CompletedProcess[str]:
    """Execute a git subprocess and wrap `OSError` into `error_cls`."""
    cmd = ["git", *args]
    try:
        return subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True)
    except OSError as exc:
        prefix = context or f"Failed to execute {' '.join(cmd)}"
        raise error_cls(f"{prefix}: {exc}") from exc


def _run_git_checked(args: Sequence[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    """Execute a git subprocess and raise `ProcessExecutionError` on OSError or non-zero exit."""
    res = _run_git(args, cwd, error_cls=ProcessExecutionError)
    if res.returncode != 0:
        cmd = ["git", *args]
        detail = res.stderr.strip() or res.stdout.strip() or f"exit code {res.returncode}"
        raise ProcessExecutionError(f"Command {' '.join(cmd)} failed: {detail}")
    return res


def check_working_tree_cleanliness(
    cwd: Path,
    *,
    ignore_ephemeral: bool = True,
    path_rules: Optional[PathRules] = None,
) -> tuple[bool, tuple[str, ...]]:
    """Inspect `git status --porcelain` and return `(is_clean, dirty_paths)`."""
    res = _run_git_checked(["status", "--porcelain", "--untracked-files=all"], cwd)
    dirty: list[str] = []
    for line in res.stdout.splitlines():
        if not line.strip():
            continue
        raw_path = line[3:].strip() if len(line) > 3 and line[2] == " " else line[2:].strip()
        norm = normalize_repo_path(raw_path)
        if not norm:
            continue
        if ignore_ephemeral and is_ephemeral_supervisor_path(norm, path_rules=path_rules):
            continue
        dirty.append(norm)
    return (len(dirty) == 0, tuple(dirty))


def get_diff_name_only(
    base_sha: str,
    head_sha: Optional[str] = "HEAD",
    *,
    cwd: Path,
) -> tuple[str, ...]:
    """Return deduplicated, normalized file paths from `git diff --name-only`."""
    args = ["diff", "--name-only", base_sha]
    if head_sha:
        args.append(head_sha)
    res = _run_git_checked(args, cwd)

    seen: set[str] = set()
    files: list[str] = []
    for line in res.stdout.splitlines():
        if not line.strip():
            continue
        norm = normalize_repo_path(line)
        if norm and norm not in seen:
            seen.add(norm)
            files.append(norm)
    return tuple(files)


def get_phase_changed_files(
    baseline_sha: Optional[str],
    end_sha: str,
    *,
    cwd: Path,
    path_rules: Optional[PathRules] = None,
) -> tuple[str, ...]:
    """Return deduplicated, non-metadata files changed between `baseline_sha` and `end_sha`."""
    if not baseline_sha or verify_git_commit(baseline_sha, cwd) is None:
        return ()

    rules = path_rules if path_rules is not None else PathRules()
    raw_files: list[str] = []
    if end_sha != "HEAD" and verify_git_commit(end_sha, cwd) is not None:
        raw_files.extend(get_diff_name_only(baseline_sha, end_sha, cwd=cwd))
    else:
        raw_files.extend(get_diff_name_only(baseline_sha, "HEAD", cwd=cwd))
        raw_files.extend(get_diff_name_only("HEAD", None, cwd=cwd))

    seen: set[str] = set()
    filtered: list[str] = []
    for filepath in raw_files:
        if filepath in seen:
            continue
        seen.add(filepath)
        if any(filepath.startswith(prefix) for prefix in rules.metadata_prefixes):
            continue
        filtered.append(filepath)
    return tuple(filtered)


def git_add_and_commit(
    paths: Sequence[Union[str, Path]],
    message: str,
    *,
    cwd: Path,
) -> None:
    """Stage `paths` and create a commit with `message` inside `cwd`."""
    str_paths = [str(p) for p in paths]
    if not str_paths:
        raise ProcessExecutionError("Cannot commit with empty path list")
    _run_git_checked(["add", "--", *str_paths], cwd)
    _run_git_checked(["commit", "-m", message], cwd)


# ---------------------------------------------------------------------------
# Commit, Git Notes & Checkpoint Auditing
# ---------------------------------------------------------------------------


def _assert_sha_not_baseline(
    sha: str,
    base_sha: Optional[str],
    label: str,
) -> None:
    """Fail fast when `sha` matches a hex `base_sha` on its 7-char prefix."""
    if base_sha and _HEX_SHA_RE.match(base_sha.strip()):
        if sha.strip()[:7].lower() == base_sha.strip()[:7].lower():
            raise SupervisorInvariantError(
                f"{label} SHA '{sha}' matches baseline SHA '{base_sha}' (no new commit created)"
            )


def _assert_plan_commit(
    plan_path: Path,
    work_dir: Path,
    context_desc: str,
    *,
    raise_process_error: bool = False,
) -> None:
    """Verify the latest commit touching `plan_path` carries a `conductor(plan)` message."""
    err_cls: type[ConductorError] = (
        ProcessExecutionError if raise_process_error else SupervisorInvariantError
    )
    plan_log = _run_git(
        ["log", "-1", "--pretty=%B", "--", str(plan_path)],
        work_dir,
        error_cls=err_cls,
        context=f"Failed to inspect git log for '{plan_path}'",
    )

    if plan_log.returncode != 0:
        detail = plan_log.stderr.strip() or f"exit code {plan_log.returncode}"
        raise err_cls(f"Failed to inspect git log for '{plan_path}' ({context_desc}): {detail}")

    if "conductor(plan)" not in plan_log.stdout:
        raise SupervisorInvariantError(
            f"Latest commit on '{plan_path}' ({context_desc}) is missing 'conductor(plan)' prefix"
        )


def audit_git_commit_and_notes(
    task: TaskInfo,
    commit_sha: str,
    plan_path: Path,
    cwd: Optional[Path] = None,
    base_sha: Optional[str] = None,
    supervisor: Optional[SupervisorProfile] = None,
) -> bool:
    """Audit a task commit's ancestry, Conventional Commit header, git notes, and plan update."""
    sup = supervisor if supervisor is not None else SupervisorProfile()
    work_dir = Path(cwd) if cwd is not None else Path.cwd()

    _assert_sha_not_baseline(commit_sha, base_sha, "Task commit")

    rev_res = _run_git(
        ["rev-parse", "--verify", f"{commit_sha}^{{commit}}"],
        work_dir,
        error_cls=ProcessExecutionError,
    )
    if rev_res.returncode != 0:
        raise SupervisorInvariantError(
            f"Commit '{commit_sha}' does not resolve to a valid git commit: {rev_res.stderr.strip()}"
        )
    resolved_sha = rev_res.stdout.strip() or commit_sha
    _assert_sha_not_baseline(resolved_sha, base_sha, "Task commit")

    if base_sha and _HEX_SHA_RE.match(base_sha.strip()):
        desc_res = _run_git(
            ["merge-base", "--is-ancestor", base_sha.strip(), resolved_sha],
            work_dir,
            error_cls=ProcessExecutionError,
        )
        if desc_res.returncode != 0:
            raise SupervisorInvariantError(
                f"Commit '{commit_sha}' is not a descendant of baseline '{base_sha}'"
            )

    head_res = _run_git(
        ["merge-base", "--is-ancestor", resolved_sha, "HEAD"],
        work_dir,
        error_cls=ProcessExecutionError,
    )
    if head_res.returncode != 0:
        raise SupervisorInvariantError(f"Commit '{commit_sha}' is not an ancestor of HEAD")

    msg_res = _run_git(
        ["log", "-1", "--format=%B", resolved_sha],
        work_dir,
        error_cls=ProcessExecutionError,
    )
    if msg_res.returncode != 0:
        raise ProcessExecutionError(
            f"Failed to read commit message for '{resolved_sha}': {msg_res.stderr.strip()}"
        )

    lines = [ln.strip() for ln in msg_res.stdout.splitlines() if ln.strip()]
    first_line = lines[0] if lines else ""
    if not sup.conventional_commit_types:
        raise SupervisorInvariantError("No conventional_commit_types configured in SupervisorProfile")
    types_alt = "|".join(re.escape(t) for t in sup.conventional_commit_types)
    cc_pattern = rf"^({types_alt})(\([a-zA-Z0-9_\-./]+\))?!?: .+$"
    if not first_line or not re.match(cc_pattern, first_line):
        raise SupervisorInvariantError(
            f"Commit '{commit_sha}' subject '{first_line}' violates Conventional Commits"
        )

    notes_res = _run_git(
        ["notes", "show", commit_sha],
        work_dir,
        error_cls=ProcessExecutionError,
    )
    if notes_res.returncode != 0 or not notes_res.stdout.strip():
        raise SupervisorInvariantError(f"Missing git notes on commit '{commit_sha}'")

    notes_body = notes_res.stdout
    for required_field in sup.required_note_fields:
        if required_field not in notes_body:
            raise SupervisorInvariantError(
                f"Git notes on commit '{commit_sha}' missing required field '{required_field}'"
            )

    if not plan_path.is_file():
        raise SupervisorInvariantError(f"Plan file not found during commit audit: {plan_path}")
    if task.status != "complete":
        raise SupervisorInvariantError(
            f"Task {task.task_num} status is '{task.status}', expected 'complete'"
        )

    short_sha = commit_sha.strip()[:7].lower()
    plan_lines = plan_path.read_text(encoding="utf-8").splitlines()
    if not any(_MARKED_TASK_LINE_RE.match(ln) and short_sha in ln.lower() for ln in plan_lines):
        raise SupervisorInvariantError(
            f"Plan file '{plan_path}' lacks a '[x]' task line referencing commit '{short_sha}'"
        )

    _assert_plan_commit(plan_path, work_dir, f"task {task.task_num}", raise_process_error=True)
    return True


def verify_checkpoint_commit_and_notes(
    phase_num: int,
    plan_path: Path,
    cwd: Optional[Path] = None,
    base_sha: Optional[str] = None,
) -> str:
    """Verify a phase checkpoint commit, git notes, and `conductor(plan)` update."""
    if not plan_path.is_file():
        raise SupervisorInvariantError(f"Plan file not found: {plan_path}")

    phases = parse_plan_file(plan_path)
    phase = phases.get(phase_num)
    if phase is None or not phase.checkpoint_sha:
        raise SupervisorInvariantError(
            f"Phase {phase_num} in '{plan_path}' is missing a [checkpoint: <sha>] tag"
        )

    cp_sha = phase.checkpoint_sha
    _assert_sha_not_baseline(cp_sha, base_sha, "Checkpoint")

    work_dir = Path(cwd) if cwd is not None else Path.cwd()

    msg_res = _run_git(
        ["log", "-1", "--format=%B", cp_sha],
        work_dir,
        error_cls=SupervisorInvariantError,
        context=f"Failed to read checkpoint commit '{cp_sha}'",
    )
    if msg_res.returncode != 0:
        raise SupervisorInvariantError(
            f"Failed to read checkpoint commit '{cp_sha}': {msg_res.stderr.strip()}"
        )

    msg_lines = [ln.strip() for ln in msg_res.stdout.splitlines() if ln.strip()]
    expected_prefix = f"conductor(checkpoint): Checkpoint end of Phase {phase_num}"
    if not msg_lines or not msg_lines[0].startswith(expected_prefix):
        raise SupervisorInvariantError(
            f"Checkpoint commit '{cp_sha}' must begin with '{expected_prefix}'"
        )

    notes_res = _run_git(
        ["notes", "show", cp_sha],
        work_dir,
        error_cls=SupervisorInvariantError,
        context=f"Failed to read git notes for checkpoint commit '{cp_sha}'",
    )
    if notes_res.returncode != 0 or not notes_res.stdout.strip():
        raise SupervisorInvariantError(f"Checkpoint commit '{cp_sha}' is missing git notes")

    _assert_plan_commit(plan_path, work_dir, f"phase {phase_num} checkpoint", raise_process_error=False)
    return cp_sha


# ---------------------------------------------------------------------------
# Safe Clipboard Export
# ---------------------------------------------------------------------------


def copy_to_clipboard(text: str, *, timeout: float = 5.0) -> bool:
    """Copy `text` to the system clipboard with DEVNULL stdout, finite timeout, and OSC 52 fallback."""
    payload = text.encode("utf-8")
    for cmd in _CLIPBOARD_TOOLS:
        try:
            proc = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            try:
                proc.communicate(input=payload, timeout=timeout)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.communicate()
                continue
            if proc.returncode == 0:
                return True
        except (FileNotFoundError, OSError):
            continue

    osc52 = f"\033]52;c;{base64.b64encode(payload).decode('ascii')}\a"
    try:
        with open("/dev/tty", "w", encoding="utf-8") as tty:
            tty.write(osc52)
            tty.flush()
        return True
    except OSError:
        pass

    if hasattr(sys.stderr, "isatty") and sys.stderr.isatty():
        try:
            sys.stderr.write(osc52)
            sys.stderr.flush()
            return True
        except OSError:
            pass

    return False


__all__ = [
    "audit_git_commit_and_notes",
    "check_working_tree_cleanliness",
    "copy_to_clipboard",
    "derive_scope",
    "get_diff_name_only",
    "get_phase_changed_files",
    "git_add_and_commit",
    "is_ephemeral_supervisor_path",
    "is_supervisor_log_path",
    "normalize_repo_path",
    "rel_to_root",
    "resolve_phase_baseline_sha",
    "resolve_phase_end_sha",
    "resolve_repo_root",
    "resolve_track_dir",
    "verify_checkpoint_commit_and_notes",
    "verify_git_commit",
]
