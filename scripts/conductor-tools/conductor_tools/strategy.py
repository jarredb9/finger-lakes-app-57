"""Single-pass verification strategy engine and shared shell command parser."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
import shlex
from typing import Optional, Sequence, Union

from conductor_tools import git_scope
from conductor_tools.models import (
    ConductorError,
    PhaseCheckpointContext,
    PromptMode,
    TaskBlueprint,
    TaskInfo,
    TrackPlan,
    VerificationStrategy,
)
from conductor_tools.parser import (
    EXEMPT_RE,
    TASK_SHA_BARE_RE,
    TASK_SHA_RE,
    extract_backtick_spans,
    is_checkpoint_task,
    is_metadata_path,
    is_test_file,
    parse_task_blueprint,
)
from conductor_tools.profile import (
    DomainRule,
    RepoProfile,
    SafetyProfile,
    SuiteConfig,
    SupervisorProfile,
    TypeCheckProfile,
)

ENV_ASSIGNMENT_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", re.DOTALL)
BLOCKED_ENV_VARS = frozenset(
    {
        "LD_PRELOAD",
        "LD_LIBRARY_PATH",
        "LD_AUDIT",
        "DYLD_INSERT_LIBRARIES",
        "DYLD_LIBRARY_PATH",
        "DYLD_FRAMEWORK_PATH",
        "BASH_ENV",
        "ENV",
        "PYTHONINSPECT",
    }
)

_WHITESPACE_RE = re.compile(r"\s+")
_BACKTICK_FILE_RE = re.compile(r"^[a-zA-Z0-9_\-/\.]+\.[a-zA-Z0-9]+$")
_SIBLING_PLAN_RE_TEMPLATE = r"^phase-{phase_num}-task-(\d+)-plan\.md$"


@dataclass(frozen=True, slots=True)
class ParsedCommand:
    """Runnable command segment parsed from a shell verification string."""

    argv: tuple[str, ...]
    env_overrides: dict[str, str]
    cwd: Path


# ---------------------------------------------------------------------------
# Quote-Aware Shell Splitting & Safe Command Parsing
# ---------------------------------------------------------------------------


def _reject_subshell_operator(cmd: str, index: int) -> None:
    """Raise ValueError if `cmd[index]` starts a backtick or `$(...)` subshell operator."""
    ch = cmd[index]
    if ch == "`":
        raise ValueError("Unsupported subshell backtick operator in verification command")
    if ch == "$" and index + 1 < len(cmd) and cmd[index + 1] == "(":
        raise ValueError("Unsupported subshell '$(...)' operator in verification command")


def split_unquoted_and_chains(
    cmd: str,
    *,
    reject_shell_ops: bool = True,
) -> list[str]:
    """Split a shell command on unquoted `&&` operators, honoring quotes, escapes, and comments."""
    segments: list[str] = []
    buf: list[str] = []
    in_single = False
    in_double = False
    escaped = False
    at_token_boundary = True
    saw_and_operator = False
    i = 0
    n = len(cmd)

    while i < n:
        ch = cmd[i]
        if escaped:
            buf.append(ch)
            escaped = False
            at_token_boundary = False
            i += 1
            continue

        if in_single:
            buf.append(ch)
            if ch == "'":
                in_single = False
            i += 1
            continue

        if ch == "\\":
            buf.append(ch)
            escaped = True
            at_token_boundary = False
            i += 1
            continue

        if in_double:
            if reject_shell_ops:
                _reject_subshell_operator(cmd, i)
            buf.append(ch)
            if ch == '"':
                in_double = False
            i += 1
            continue

        if ch == "'":
            in_single = True
            buf.append(ch)
            at_token_boundary = False
            i += 1
            continue

        if ch == '"':
            in_double = True
            buf.append(ch)
            at_token_boundary = False
            i += 1
            continue

        if ch == "#" and at_token_boundary:
            while i < n and cmd[i] != "\n":
                i += 1
            at_token_boundary = True
            continue

        if ch == "&" and i + 1 < n and cmd[i + 1] == "&":
            seg = "".join(buf).strip()
            if seg:
                segments.append(seg)
            elif reject_shell_ops:
                raise ValueError("Invalid empty command segment before '&&' in verification command")
            buf = []
            at_token_boundary = True
            saw_and_operator = True
            i += 2
            continue

        if reject_shell_ops:
            if ch in ("\n", "\r"):
                raise ValueError("Unsupported newline in verification command")
            _reject_subshell_operator(cmd, i)
            if ch == "|" and i + 1 < n and cmd[i + 1] == "|":
                raise ValueError("Unsupported shell operator '||' in verification command")
            if ch in (";", "|", ">", "<", "&"):
                raise ValueError(f"Unsupported shell operator '{ch}' in verification command")

        buf.append(ch)
        at_token_boundary = ch.isspace()
        i += 1

    tail = "".join(buf).strip()
    if tail:
        segments.append(tail)
    elif saw_and_operator and reject_shell_ops:
        raise ValueError("Trailing '&&' without a following command in verification command")
    return segments


def _split_tokens_with_env_prefix_count(seg: str) -> tuple[list[str], int]:
    """Tokenize a segment and return `(tokens, leading_env_assignment_count)`."""
    try:
        tokens = shlex.split(seg, comments=True)
    except ValueError:
        tokens = seg.strip().split()
    idx = 0
    while idx < len(tokens) and ENV_ASSIGNMENT_RE.match(tokens[idx]):
        idx += 1
    return tokens, idx


def has_leading_env_assignment(seg: str) -> bool:
    """Return True when a command segment starts with one or more `KEY=VALUE` assignments."""
    _, idx = _split_tokens_with_env_prefix_count(seg)
    return idx > 0


def strip_leading_env_assignments(seg: str) -> str:
    """Strip leading `KEY=VALUE` tokens from a command segment for prefix/safety inspection."""
    tokens, idx = _split_tokens_with_env_prefix_count(seg)
    return " ".join(tokens[idx:])


def is_cd_segment(seg: str) -> bool:
    """Return True when a command segment (after any env prefix) invokes `cd`."""
    core = strip_leading_env_assignments(seg)
    return core == "cd" or core.startswith("cd ")


def strip_trailing_cd_segments(segments: Sequence[str]) -> list[str]:
    """Remove dangling trailing `cd` segments from a sequence of `&&` command segments."""
    trimmed = list(segments)
    while trimmed and is_cd_segment(trimmed[-1]):
        trimmed.pop()
    return trimmed


def parse_verification_commands(
    cmd_input: Union[str, Sequence[str]],
    work_dir: Path,
    *,
    check_cd_exists: bool = True,
) -> list[ParsedCommand]:
    """Parse verification commands into runnable `ParsedCommand` entries without `shell=True`."""
    if not isinstance(cmd_input, str):
        argv = tuple(cmd_input)
        if not argv:
            raise ValueError("Empty verification command list")
        return [ParsedCommand(argv=argv, env_overrides={}, cwd=work_dir)]

    segments = split_unquoted_and_chains(cmd_input, reject_shell_ops=True)
    if not segments:
        raise ValueError(f"Empty verification command: {cmd_input!r}")

    repo_root_resolved = work_dir.resolve()
    seg_cwd = repo_root_resolved
    parsed: list[ParsedCommand] = []

    for seg in segments:
        tokens = shlex.split(seg, comments=True)
        if not tokens:
            continue

        env_overrides: dict[str, str] = {}
        idx = 0
        while idx < len(tokens):
            match = ENV_ASSIGNMENT_RE.match(tokens[idx])
            if not match:
                break
            key, val = match.group(1), match.group(2)
            if key in BLOCKED_ENV_VARS or key.startswith(("LD_", "DYLD_")):
                raise ValueError(
                    f"Disallowed environment variable override '{key}' in verification command"
                )
            env_overrides[key] = val
            idx += 1

        remaining = tokens[idx:]
        if not remaining:
            raise ValueError(
                "Verification command segment sets environment variable(s) without an executable"
            )
        if remaining[0] == "export":
            raise ValueError("Unsupported shell builtin 'export' in verification command")

        if remaining[0] == "cd":
            if env_overrides:
                raise ValueError("Environment variable prefixes are not supported on 'cd' segments")
            if (
                len(remaining) != 2
                or not remaining[1]
                or remaining[1].startswith("-")
                or remaining[1].startswith("~")
            ):
                raise ValueError(f"Unsupported 'cd' syntax in verification command: {seg!r}")
            target_dir = (seg_cwd / remaining[1]).resolve()
            if not target_dir.is_relative_to(repo_root_resolved):
                raise ValueError(
                    f"Verification 'cd {remaining[1]}' escapes repository root {repo_root_resolved}"
                )
            if check_cd_exists and not target_dir.is_dir():
                raise ValueError(
                    f"Verification 'cd' target directory does not exist: {target_dir}"
                )
            seg_cwd = target_dir
            continue

        parsed.append(ParsedCommand(argv=tuple(remaining), env_overrides=env_overrides, cwd=seg_cwd))

    if not parsed:
        raise ValueError(f"Verification command has no executable command: {cmd_input!r}")
    return parsed


# ---------------------------------------------------------------------------
# Safety, Idempotency & Static-Analysis Filtering
# ---------------------------------------------------------------------------


def _classify_cd_segment(seg: str) -> Optional[bool]:
    """Return `None` if not a `cd` segment, `True` if valid `cd`, or `False` if env-prefixed."""
    if not is_cd_segment(seg):
        return None
    return not has_leading_env_assignment(seg)


def is_executable_subtask_cmd(
    cmd: str,
    safety: Optional[SafetyProfile] = None,
) -> bool:
    """Return True when `cmd` (after valid `cd` and env prefixes) starts with an allowed prefix."""
    profile = safety if safety is not None else SafetyProfile()
    segments = split_unquoted_and_chains(cmd, reject_shell_ops=False)
    has_executable = False
    for seg in segments:
        cd_valid = _classify_cd_segment(seg)
        if cd_valid is False:
            return False
        if cd_valid:
            continue
        if not has_executable:
            core_seg = strip_leading_env_assignments(seg)
            if not core_seg or not any(
                core_seg.startswith(prefix) for prefix in profile.command_prefixes
            ):
                return False
            has_executable = True
    return has_executable


def filter_idempotent_verification_cmd(
    cmd: str,
    safety: Optional[SafetyProfile] = None,
) -> Optional[str]:
    """Filter a candidate shell command down to idempotent, non-mutating verification gates."""
    if not cmd:
        return None

    profile = safety if safety is not None else SafetyProfile()
    mutating_res = tuple(
        re.compile(pat, re.IGNORECASE) for pat in profile.mutating_cmd_patterns
    )
    mutating_git_prefixes = tuple(p.lower() for p in profile.mutating_git_prefixes)

    segments = split_unquoted_and_chains(cmd, reject_shell_ops=False)
    kept: list[str] = []
    for seg in segments:
        if seg.startswith("! "):
            seg = seg[2:].strip()
        if not seg or seg.startswith("#"):
            continue
        cd_valid = _classify_cd_segment(seg)
        if cd_valid is False:
            return None
        if cd_valid:
            kept.append(seg)
            continue
        core_seg = strip_leading_env_assignments(seg)
        if not core_seg:
            continue
        if any(pat.search(core_seg) for pat in mutating_res):
            continue
        core_lower = core_seg.lower()
        if any(core_lower.startswith(prefix) for prefix in mutating_git_prefixes):
            continue
        if any(token in core_seg for token in profile.allowed_verification_tokens):
            kept.append(seg)

    kept = strip_trailing_cd_segments(kept)
    if not kept:
        return None
    return " && ".join(kept)


def _matches_command_prefix(cmd: str, prefixes: Sequence[str]) -> bool:
    """Return True when `cmd` (minus leading env assignments) matches a prefix on a token boundary."""
    core = strip_leading_env_assignments(cmd).strip().lower()
    if not core:
        return False
    for raw_prefix in prefixes:
        prefix = raw_prefix.strip().lower()
        if prefix and re.match(rf"^{re.escape(prefix)}(?:\s|$)", core):
            return True
    return False


def is_static_analysis_cmd(
    cmd: str,
    supervisor: Optional[SupervisorProfile] = None,
) -> bool:
    """Return True when `cmd` invokes a configured static-analysis or build tool."""
    sup = supervisor if supervisor is not None else SupervisorProfile()
    return _matches_command_prefix(cmd, sup.static_analysis_prefixes)


def strip_static_analysis_segments(
    cmd: str,
    supervisor: Optional[SupervisorProfile] = None,
) -> Optional[str]:
    """Drop static-analysis segments from an `&&`-chained command, returning `None` if empty."""
    sup = supervisor if supervisor is not None else SupervisorProfile()
    segments = split_unquoted_and_chains(cmd, reject_shell_ops=False)
    kept = [seg for seg in segments if not is_static_analysis_cmd(seg, sup)]
    kept = strip_trailing_cd_segments(kept)
    if not kept:
        return None
    return " && ".join(kept)


def is_type_check_cmd(
    cmd: str,
    type_check: Optional[TypeCheckProfile] = None,
) -> bool:
    """Return True when `cmd` invokes the configured type-checking command."""
    tc = type_check if type_check is not None else TypeCheckProfile()
    if not tc.cmd or not tc.cmd.strip():
        return False
    return _matches_command_prefix(cmd, (tc.cmd,))


# ---------------------------------------------------------------------------
# Task Mode & Phase Domain Classification
# ---------------------------------------------------------------------------


def _extract_exempt_category(text: str) -> Optional[str]:
    """Extract normalized lowercase exempt category from `[exempt: ...]` if present."""
    match = EXEMPT_RE.search(text)
    if not match:
        return None
    return match.group(1).strip().lower() or None


def classify_task_mode(
    task_desc: str,
    *,
    exempt: Optional[str] = None,
    mode_override: Optional[PromptMode] = None,
    is_checkpoint: Optional[bool] = None,
    profile: Optional[RepoProfile] = None,
) -> PromptMode:
    """Classify a task into `CHECKPOINT`, `EXEMPT`, `RED`, or `GREEN` mode."""
    prof = profile if profile is not None else RepoProfile()
    checkpoint_flag = (
        is_checkpoint if is_checkpoint is not None else is_checkpoint_task(task_desc)
    )

    if mode_override is not None:
        if checkpoint_flag and mode_override != PromptMode.CHECKPOINT:
            raise ConductorError("Cannot override checkpoint task mode")
        return mode_override

    if checkpoint_flag:
        return PromptMode.CHECKPOINT

    exempt_cat = (
        exempt.strip().lower()
        if exempt is not None and exempt.strip()
        else _extract_exempt_category(task_desc)
    )
    if exempt_cat:
        if exempt_cat not in prof.exempt:
            raise ConductorError(f"Unknown exempt category {exempt_cat!r}")
        return PromptMode.EXEMPT

    desc_lower = task_desc.lower().strip()
    if (
        desc_lower.startswith("test(")
        or desc_lower.startswith("write failing")
        or "red phase" in desc_lower
        or "(red)" in desc_lower
        or "failing unit test" in desc_lower
        or "failing test" in desc_lower
        or "failing integration" in desc_lower
    ):
        return PromptMode.RED

    return PromptMode.GREEN


def classify_phase_domain(
    changed_files: Sequence[str],
    tasks: Sequence[TaskInfo] = (),
    domains: Optional[dict[str, DomainRule]] = None,
) -> str:
    """Classify a phase into a configured domain by rule priority, falling back to `backend_tooling`."""
    if not domains:
        return "backend_tooling"

    ordered_domains = sorted(
        domains.items(),
        key=lambda item: item[1].priority,
        reverse=True,
    )

    normalized_files = [git_scope.normalize_repo_path(f) for f in changed_files]
    if normalized_files:
        for domain_name, rule in ordered_domains:
            for norm in normalized_files:
                if (
                    norm in rule.exact_paths
                    or any(norm.startswith(p) for p in rule.path_prefixes)
                    or any(sub in norm for sub in rule.path_substrings)
                ):
                    return domain_name
    else:
        all_text = " ".join(
            f"{t.description} {' '.join(t.subtasks)}" for t in tasks
        ).lower()
        for domain_name, rule in ordered_domains:
            if any(kw.lower() in all_text for kw in rule.keywords):
                return domain_name

    return "backend_tooling"


# ---------------------------------------------------------------------------
# Suite Routing & Type-Check Gating Helpers
# ---------------------------------------------------------------------------


def _file_matches_suite(filepath: str, suite: SuiteConfig) -> bool:
    """Return True when `filepath` matches `suite`'s prefix/suffix filters without exclusion."""
    if suite.exclude_suffixes and any(filepath.endswith(s) for s in suite.exclude_suffixes):
        return False
    if not suite.path_prefixes and not suite.path_suffixes:
        return False
    if suite.path_prefixes and not any(filepath.startswith(p) for p in suite.path_prefixes):
        return False
    if suite.path_suffixes and not any(filepath.endswith(s) for s in suite.path_suffixes):
        return False
    return True


def _build_suite_commands(
    files: Sequence[str],
    desc_lower: str,
    suites: Sequence[SuiteConfig],
    *,
    include_full_suite: bool = False,
) -> list[str]:
    """Build ordered, deduplicated verification commands across all matching `[[suites]]`."""
    commands: list[str] = []
    seen_cmds: set[str] = set()
    unique_files = list(dict.fromkeys(files))

    for suite in suites:
        matched = [f for f in unique_files if _file_matches_suite(f, suite)]
        emitted: Optional[str] = None
        if include_full_suite and suite.include_in_full_suite:
            emitted = suite.full_cmd
        elif matched:
            if suite.targeted_cmd:
                if "{files}" in suite.targeted_cmd:
                    quoted_files = " ".join(shlex.quote(f) for f in matched)
                    emitted = suite.targeted_cmd.replace("{files}", quoted_files)
                else:
                    emitted = suite.targeted_cmd
            else:
                emitted = suite.full_cmd
        elif suite.keywords and any(kw.lower() in desc_lower for kw in suite.keywords):
            emitted = suite.full_cmd

        if emitted and emitted not in seen_cmds:
            seen_cmds.add(emitted)
            commands.append(emitted)

    return commands


def _should_append_type_check(
    target_files: Sequence[str],
    commands: Sequence[str],
    type_check: TypeCheckProfile,
    *,
    wants_type_check: bool = False,
    allow_empty_fallback: bool = True,
) -> bool:
    """Determine whether `type_check.cmd` should be appended to `commands`."""
    if not type_check.cmd or not type_check.cmd.strip():
        return False
    if any(tok in cmd for cmd in commands for tok in type_check.check_tokens):
        return False
    if any(is_type_check_cmd(cmd, type_check) for cmd in commands):
        return False
    if wants_type_check:
        return True
    if not target_files:
        return allow_empty_fallback
    if not type_check.extensions:
        return True
    return any(f.endswith(type_check.extensions) for f in target_files)


# ---------------------------------------------------------------------------
# Phase Checkpoint Context Collection & Single-Pass Strategy Inference
# ---------------------------------------------------------------------------


def collect_phase_checkpoint_context(
    track_plan: TrackPlan,
    phase_num: Optional[int],
    task_num: Optional[int],
    *,
    profile: Optional[RepoProfile] = None,
    cwd: Optional[Path] = None,
) -> PhaseCheckpointContext:
    """Aggregate git diff scope, sibling plans, idempotent commands, and domain for a checkpoint."""
    prof = profile if profile is not None else RepoProfile()
    work_dir = Path(cwd) if cwd is not None else track_plan.track_dir

    phase_info = track_plan.phases.get(phase_num) if phase_num is not None else None
    phase_tasks = phase_info.tasks if phase_info is not None else ()
    non_checkpoint_tasks = [t for t in phase_tasks if not t.is_checkpoint]

    checkpoint_plan_path = (
        track_plan.track_dir / f"phase-{phase_num}-task-{task_num}-plan.md"
        if phase_num is not None and task_num is not None
        else None
    )
    has_checkpoint_plan = bool(checkpoint_plan_path and checkpoint_plan_path.is_file())

    sibling_plans: list[tuple[int, Path]] = []
    if phase_num is not None and track_plan.track_dir.is_dir():
        plan_re = re.compile(_SIBLING_PLAN_RE_TEMPLATE.format(phase_num=phase_num))
        for entry in track_plan.track_dir.iterdir():
            if not entry.is_file():
                continue
            match = plan_re.match(entry.name)
            if not match:
                continue
            idx = int(match.group(1))
            if idx != task_num:
                sibling_plans.append((idx, entry))
        sibling_plans.sort(key=lambda item: item[0])

    sibling_targets: list[str] = []
    seen_targets: set[str] = set()
    harvested_raw_cmds: list[str] = []
    seen_raw_cmds: set[str] = set()

    for _, sp_path in sibling_plans:
        sp_bp = parse_task_blueprint(sp_path, path_rules=prof.paths)
        for tf in sp_bp.target_files:
            if not is_metadata_path(tf, prof.paths) and tf not in seen_targets:
                seen_targets.add(tf)
                sibling_targets.append(tf)
        for cmd in sp_bp.verification_commands:
            if cmd not in seen_raw_cmds:
                seen_raw_cmds.add(cmd)
                harvested_raw_cmds.append(cmd)

    for task in non_checkpoint_tasks:
        for span in extract_backtick_spans([task.description, *task.subtasks]):
            if is_executable_subtask_cmd(span, prof.safety):
                if span not in seen_raw_cmds:
                    seen_raw_cmds.add(span)
                    harvested_raw_cmds.append(span)
            elif (
                "/" in span
                and " " not in span
                and _BACKTICK_FILE_RE.match(span)
                and not is_metadata_path(span, prof.paths)
                and not is_test_file(span, prof.paths)
                and span not in seen_targets
            ):
                seen_targets.add(span)
                sibling_targets.append(span)

    baseline_sha = git_scope.resolve_phase_baseline_sha(
        track_plan.phases, phase_num, work_dir
    )
    end_sha = git_scope.resolve_phase_end_sha(track_plan.phases, phase_num, work_dir)

    phase_has_activity = any(
        t.status in ("complete", "in_progress") or t.commit_sha
        for t in non_checkpoint_tasks
    )
    git_changed_files: tuple[str, ...] = ()
    if phase_has_activity and baseline_sha:
        git_changed_files = git_scope.get_phase_changed_files(
            baseline_sha,
            end_sha,
            cwd=work_dir,
            path_rules=prof.paths,
        )

    changed_files = tuple(dict.fromkeys((*git_changed_files, *sibling_targets)))

    commands: list[str] = []
    seen_cmds: set[str] = set()

    # Tier 1: Explicit checkpoint plan verification commands
    if has_checkpoint_plan and checkpoint_plan_path is not None:
        cp_bp = parse_task_blueprint(checkpoint_plan_path, path_rules=prof.paths)
        for raw_cmd in cp_bp.verification_commands:
            filtered = filter_idempotent_verification_cmd(raw_cmd, prof.safety)
            if filtered and filtered not in seen_cmds:
                seen_cmds.add(filtered)
                commands.append(filtered)

    # Tier 2: Filtered verification commands harvested from sibling plans and subtasks
    if not commands:
        for raw_cmd in harvested_raw_cmds:
            filtered = filter_idempotent_verification_cmd(raw_cmd, prof.safety)
            if filtered and filtered not in seen_cmds:
                seen_cmds.add(filtered)
                commands.append(filtered)
        if commands and _should_append_type_check(
            changed_files, commands, prof.type_check, allow_empty_fallback=False
        ):
            if prof.type_check.cmd and prof.type_check.cmd not in seen_cmds:
                seen_cmds.add(prof.type_check.cmd)
                commands.append(prof.type_check.cmd)

    # Tier 3: Suite commands derived from changed_files
    if not commands and changed_files:
        commands = _build_suite_commands(changed_files, "", prof.suites)
        if _should_append_type_check(
            changed_files, commands, prof.type_check, allow_empty_fallback=False
        ):
            if prof.type_check.cmd and prof.type_check.cmd not in commands:
                commands.append(prof.type_check.cmd)

    # Tier 4: Domain / docs-exempt / supervisor fallbacks
    domain = classify_phase_domain(changed_files, non_checkpoint_tasks, prof.domains)
    if not commands:
        all_docs_exempt = bool(non_checkpoint_tasks) and all(
            (t.exempt or _extract_exempt_category(t.description) or "").lower() == "docs"
            for t in non_checkpoint_tasks
        )
        if all_docs_exempt and "docs" in prof.exempt and prof.exempt["docs"].commands:
            commands = list(prof.exempt["docs"].commands)
        elif domain in prof.domains and prof.domains[domain].fallback_cmds:
            commands = list(prof.domains[domain].fallback_cmds)
        elif prof.supervisor.default_test_cmd:
            commands = [prof.supervisor.default_test_cmd]

    clean_phase_name = (
        phase_info.name
        if phase_info is not None and phase_info.name
        else (f"Phase {phase_num}" if phase_num is not None else "")
    )
    raw_heading = (
        phase_info.raw_heading
        if phase_info is not None and phase_info.raw_heading
        else (f"## Phase {phase_num}: {clean_phase_name}".strip() if phase_num is not None else "")
    )

    return PhaseCheckpointContext(
        baseline_sha=baseline_sha,
        end_sha=end_sha,
        changed_files=changed_files,
        sibling_plans=tuple(git_scope.rel_to_root(p, work_dir) for _, p in sibling_plans),
        commands=tuple(commands),
        domain=domain,
        has_checkpoint_plan=has_checkpoint_plan,
        clean_phase_name=clean_phase_name,
        raw_heading=raw_heading,
    )


def _strip_exempt_and_sha(desc: str) -> str:
    """Remove `[exempt: ...]` and trailing commit/checkpoint SHA annotations from `desc`."""
    clean = EXEMPT_RE.sub("", desc).strip()
    clean = TASK_SHA_RE.sub("", clean).strip()
    clean = TASK_SHA_BARE_RE.sub("", clean).strip()
    return _WHITESPACE_RE.sub(" ", clean).strip()


def infer_verification_strategy(
    track_plan: TrackPlan,
    phase_num: Optional[int],
    task_num: Optional[int],
    *,
    task: Optional[TaskInfo] = None,
    task_desc: str = "",
    subtasks: Sequence[str] = (),
    blueprint: Optional[TaskBlueprint] = None,
    mode_override: Optional[PromptMode] = None,
    exempt: Optional[str] = None,
    profile: Optional[RepoProfile] = None,
    cwd: Optional[Path] = None,
) -> VerificationStrategy:
    """Compute a single-pass `VerificationStrategy` driven by `RepoProfile` and `TrackPlan`."""
    prof = profile if profile is not None else RepoProfile()
    work_dir = Path(cwd) if cwd is not None else track_plan.track_dir
    scope = git_scope.derive_scope(track_plan.track_name)

    resolved_task = task
    if resolved_task is None and phase_num is not None and task_num is not None:
        phase_obj = track_plan.phases.get(phase_num)
        if phase_obj is not None:
            resolved_task = next(
                (t for t in phase_obj.tasks if t.task_num == task_num),
                None,
            )

    resolved_desc = task_desc or (resolved_task.description if resolved_task is not None else "")
    resolved_subtasks = (
        tuple(subtasks)
        if subtasks
        else (resolved_task.subtasks if resolved_task is not None else ())
    )

    if blueprint is not None:
        resolved_blueprint = blueprint
    elif phase_num is not None and task_num is not None:
        bp_path = track_plan.track_dir / f"phase-{phase_num}-task-{task_num}-plan.md"
        resolved_blueprint = parse_task_blueprint(
            bp_path,
            path_rules=prof.paths,
            task_desc=resolved_desc,
            subtasks=resolved_subtasks,
        )
    else:
        resolved_blueprint = TaskBlueprint(plan_path=track_plan.track_dir)

    resolved_exempt: Optional[str] = None
    if exempt is not None and exempt.strip():
        resolved_exempt = exempt.strip().lower()
    else:
        resolved_exempt = _extract_exempt_category(resolved_desc)
        if resolved_exempt is None and resolved_task is not None and resolved_task.exempt:
            resolved_exempt = resolved_task.exempt.strip().lower() or None

    mode = classify_task_mode(
        resolved_desc,
        exempt=resolved_exempt,
        mode_override=mode_override,
        is_checkpoint=(resolved_task.is_checkpoint if resolved_task is not None else None),
        profile=prof,
    )

    if mode == PromptMode.CHECKPOINT:
        checkpoint_ctx = collect_phase_checkpoint_context(
            track_plan,
            phase_num,
            task_num,
            profile=prof,
            cwd=work_dir,
        )
        return VerificationStrategy(
            mode=PromptMode.CHECKPOINT,
            commands=checkpoint_ctx.commands,
            instruction=(
                "- Verify phase test coverage and diff-gated verification commands, "
                "present domain-appropriate manual verification to user, await confirmation, "
                "create checkpoint commit and auditable git notes."
            ),
            commit_msg=f"conductor(checkpoint): Checkpoint end of Phase {phase_num}",
            is_red=False,
            is_checkpoint=True,
            exempt=None,
            checkpoint_context=checkpoint_ctx,
            is_python_only=False,
        )

    if mode == PromptMode.EXEMPT:
        if not resolved_exempt or resolved_exempt not in prof.exempt:
            raise ConductorError(f"Unknown exempt category {resolved_exempt!r}")
        rule = prof.exempt[resolved_exempt]
        clean_desc = _strip_exempt_and_sha(resolved_desc)
        if not clean_desc:
            clean_desc = (
                f"Execute Phase {phase_num} Task {task_num}"
                if phase_num is not None and task_num is not None
                else "Execute exempt task"
            )
        commit_msg = f"{rule.commit_prefix}({scope}): {clean_desc}".replace("`", "")
        instruction = rule.instruction or f"- Verify exempt task ({resolved_exempt})."
        return VerificationStrategy(
            mode=PromptMode.EXEMPT,
            commands=tuple(rule.commands),
            instruction=instruction,
            commit_msg=commit_msg,
            is_red=False,
            is_checkpoint=False,
            exempt=resolved_exempt,
            checkpoint_context=None,
            is_python_only=False,
        )

    is_red = mode == PromptMode.RED

    explicit_subtask_cmds: list[str] = []
    for span in extract_backtick_spans(resolved_subtasks):
        if not is_executable_subtask_cmd(span, prof.safety):
            continue
        if is_red and is_static_analysis_cmd(span, prof.supervisor):
            continue
        if span not in explicit_subtask_cmds:
            explicit_subtask_cmds.append(span)

    all_files = tuple(
        dict.fromkeys(
            (*resolved_blueprint.target_files, *resolved_blueprint.referenced_test_files)
        )
    )
    is_python_only = bool(all_files) and all(f.endswith((".py", ".toml")) for f in all_files)

    all_task_text = f"{resolved_desc}\n" + "\n".join(resolved_subtasks)
    desc_lower = all_task_text.lower()
    task_desc_lower = resolved_desc.lower()
    is_full_suite = any(
        kw.lower() in desc_lower for kw in prof.supervisor.full_suite_keywords
    )

    commands: list[str] = []
    if resolved_blueprint.verification_commands:
        if is_red:
            for raw_cmd in resolved_blueprint.verification_commands:
                stripped = strip_static_analysis_segments(raw_cmd, prof.supervisor)
                if stripped and stripped not in commands:
                    commands.append(stripped)
        else:
            for raw_cmd in resolved_blueprint.verification_commands:
                if raw_cmd not in commands:
                    commands.append(raw_cmd)
    else:
        commands = _build_suite_commands(
            all_files,
            desc_lower,
            prof.suites,
            include_full_suite=(not is_red and is_full_suite),
        )
        if not commands:
            commands = list(explicit_subtask_cmds)
        if not commands:
            full_cmds = [s.full_cmd for s in prof.suites if s.include_in_full_suite]
            if full_cmds:
                commands = list(dict.fromkeys(full_cmds))
            elif prof.supervisor.default_test_cmd:
                commands = [prof.supervisor.default_test_cmd]

    for cmd in explicit_subtask_cmds:
        if cmd not in commands:
            commands.append(cmd)

    if is_red and not commands:
        commands = _build_suite_commands(
            all_files,
            desc_lower,
            prof.suites,
            include_full_suite=False,
        )
        if not commands and prof.supervisor.default_test_cmd:
            commands = [prof.supervisor.default_test_cmd]

    if not is_red:
        wants_type_check = any(
            k in desc_lower for k in ("type-check", "type checking", "types pass")
        )
        if _should_append_type_check(
            all_files,
            commands,
            prof.type_check,
            wants_type_check=wants_type_check,
            allow_empty_fallback=True,
        ):
            if prof.type_check.cmd and prof.type_check.cmd not in commands:
                commands.append(prof.type_check.cmd)

    is_green_impl = "green phase" in task_desc_lower or task_desc_lower.startswith("implement ")
    if is_red or (
        not is_green_impl
        and (
            is_full_suite
            or "regression" in task_desc_lower
            or "test execution" in task_desc_lower
        )
    ):
        default_verb = "test"
    elif "refactor" in task_desc_lower:
        default_verb = "refactor"
    elif "cleanup" in task_desc_lower or "scaffolding" in task_desc_lower:
        default_verb = "chore"
    else:
        default_verb = "feat"

    if is_red:
        fallback_desc = f"Add failing tests for Phase {phase_num} Task {task_num}"
        instruction = "- Confirm new tests fail with expected assertions (Red phase). DO NOT implement application code."
    elif resolved_blueprint.verification_commands:
        fallback_desc = f"Implement Phase {phase_num} Task {task_num}"
        instruction = "- Execute the verification protocol from the plan and confirm all checks pass."
    elif is_full_suite:
        fallback_desc = f"Execute full automated test suite for Phase {phase_num} Task {task_num}"
        instruction = "- Verify full test suite and checks pass cleanly before committing."
    else:
        fallback_desc = f"Implement Phase {phase_num} Task {task_num}"
        instruction = "- Run targeted verification commands and confirm all checks pass cleanly."

    commit_msg = f"{default_verb}({scope}): {resolved_desc or fallback_desc}".replace("`", "")

    return VerificationStrategy(
        mode=mode,
        commands=tuple(commands),
        instruction=instruction,
        commit_msg=commit_msg,
        is_red=is_red,
        is_checkpoint=False,
        exempt=None,
        checkpoint_context=None,
        is_python_only=is_python_only,
    )


__all__ = [
    "BLOCKED_ENV_VARS",
    "ENV_ASSIGNMENT_RE",
    "ParsedCommand",
    "classify_phase_domain",
    "classify_task_mode",
    "collect_phase_checkpoint_context",
    "filter_idempotent_verification_cmd",
    "has_leading_env_assignment",
    "infer_verification_strategy",
    "is_cd_segment",
    "is_executable_subtask_cmd",
    "is_static_analysis_cmd",
    "is_type_check_cmd",
    "parse_verification_commands",
    "split_unquoted_and_chains",
    "strip_leading_env_assignments",
    "strip_static_analysis_segments",
    "strip_trailing_cd_segments",
]
