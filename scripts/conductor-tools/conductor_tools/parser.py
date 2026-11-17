"""Unified Conductor Markdown, registry, blueprint, and review parser."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import re
import shlex
from typing import Optional, Sequence, Union

from conductor_tools.models import PhaseInfo, TaskBlueprint, TaskInfo, TrackPlan
from conductor_tools.profile import PathRules, PlanningProfile, SupervisorProfile

# ---------------------------------------------------------------------------
# Compiled Markdown & Extraction Patterns
# ---------------------------------------------------------------------------

_TRACK_IN_PROGRESS_RE = re.compile(
    r"\|\s*\*\*([a-zA-Z0-9_\-]+)\*\*\s*\|(?:[^|\n]*\|)*\s*(?:\[~\]|\[[ ~]\]\s*In Progress)",
    re.IGNORECASE,
)
_TRACK_PENDING_RE = re.compile(
    r"\|\s*\*\*([a-zA-Z0-9_\-]+)\*\*\s*\|(?:[^|\n]*\|)*\s*\[ \]",
)

CHECKPOINT_HEADER_RE = re.compile(
    r"\s*`?(?:\[checkpoint:\s*`?([a-f0-9]{7,40})`?\]|\[`?([a-f0-9]{7,40})`?\])`?\s*$",
    re.IGNORECASE,
)
EXEMPT_RE = re.compile(r"\[exempt:\s*([a-zA-Z0-9_\-]+)\]", re.IGNORECASE)
TASK_SHA_RE = re.compile(
    r"\s*`?(?:\(`?([a-f0-9]{7,40})`?\)|\[(?:commit:\s*|checkpoint:\s*)?`?([a-f0-9]{7,40})`?\])`?\s*$",
    re.IGNORECASE,
)
TASK_SHA_BARE_RE = re.compile(r"\s+`?([a-f0-9]{7,40})`?\s*$", re.IGNORECASE)
PHASE_HEADER_RE = re.compile(
    r"^(#{2,3})\s+Phase(?:\s+(\d+))?[:\s]+(.*)",
    re.IGNORECASE,
)
SUBTASK_RE = re.compile(r"^(?:\s{2,}|\t+)-\s*\[([ x~X\-])\]\s*(.*)")
TASK_RE = re.compile(r"^-\s*\[([ x~X\-])\]\s+(?:Task(?:\s+\d+)?:)?\s*(.*)")

_REVIEW_FIXES_RE = re.compile(r"^review\s+fixes\b", re.IGNORECASE)
_TRAILING_CHECKPOINT_RE = re.compile(r"\s*\[checkpoint:[^\]]+\]\s*$", re.IGNORECASE)
_WHITESPACE_RE = re.compile(r"\s+")
_CHECKPOINT_PREFIX_RE = re.compile(r"^(?:final|phase(?:\s+\d+)?)\s+checkpoint\b")
_CHECKPOINT_TASK_WORD_RE = re.compile(r"\bcheckpoint\s+task\b")

_BACKTICK_SPAN_RE = re.compile(r"`([^`]*)`")
_TARGET_FILE_RE = re.compile(
    r"(?:"
    r"###\s+(?:Target\s+)?File\s+\d+:\s*(?:\[([^\]]+)\]|`([^`]+)`)"
    r"|-\s+\*\*Path:\*\*\s*(?:`([^`]+)`|([^\s\n\r]+))"
    r"|####\s+\[(?:MODIFY|NEW|DELETE)\]\s+([^\n\r]+)"
    r")"
)
_VERIFICATION_SECTION_RE = re.compile(
    r"##\s+(?:\d+\.\s+)?(?:"
    r"Execution\s+Verification\s+Protocol"
    r"|(?:Empirical\s+)?Verification\s+Plan"
    r"|(?:Execution\s+&\s+)?Verification\s+Command"
    r")\b.*?\n(.*?)(?=\n##\s|\Z)",
    re.DOTALL | re.IGNORECASE,
)
_BASH_BLOCK_RE = re.compile(r"```bash\s*\n(.*?)```", re.DOTALL)
_LINE_CONTINUATION_RE = re.compile(r"\s*\\\s*\n\s*")
_POST_EXEC_SECTION_RE = re.compile(
    r"^##\s+(?:(\d+)\.\s+)?(.*?Post-Execution.*|.*?Task Completion.*|.*?Commit Protocol.*)$",
    re.MULTILINE | re.IGNORECASE,
)
_NEXT_H2_RE = re.compile(r"^##\s+", re.MULTILINE)
_GIT_COMMIT_MSG_RE = re.compile(
    r"git commit(?:\s+[^\"\x27\n]*)?\s+-m\s+([\"\x27])([^\n]*?)\1"
)

_STATUS_MAP: dict[str, tuple[str, str]] = {
    "x": ("complete", "x"),
    "~": ("in_progress", "~"),
    "-": ("skipped", "-"),
    " ": ("pending", " "),
}


# ---------------------------------------------------------------------------
# Internal Mutable Builders for Frozen Models
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class _TaskBuilder:
    task_num: int
    description: str
    status: str
    status_char: str
    is_checkpoint: bool
    commit_sha: Optional[str]
    exempt: Optional[str]
    raw_line: str
    subtasks: list[str] = field(default_factory=list)

    def freeze(self) -> TaskInfo:
        return TaskInfo(
            task_num=self.task_num,
            description=self.description,
            status=self.status,
            status_char=self.status_char,
            is_checkpoint=self.is_checkpoint,
            commit_sha=self.commit_sha,
            exempt=self.exempt,
            subtasks=tuple(self.subtasks),
            raw_line=self.raw_line,
        )


@dataclass(slots=True)
class _PhaseBuilder:
    phase_num: int
    name: str
    checkpoint_sha: Optional[str]
    raw_heading: str
    tasks: list[_TaskBuilder] = field(default_factory=list)
    review_fixes: list[_TaskBuilder] = field(default_factory=list)

    def freeze(self) -> PhaseInfo:
        return PhaseInfo(
            phase_num=self.phase_num,
            name=self.name,
            checkpoint_sha=self.checkpoint_sha,
            raw_heading=self.raw_heading,
            tasks=tuple(task.freeze() for task in self.tasks),
            is_complete=bool(self.checkpoint_sha),
            review_fixes=tuple(task.freeze() for task in self.review_fixes),
        )


# ---------------------------------------------------------------------------
# Tracks Registry & Active Track Discovery
# ---------------------------------------------------------------------------


def parse_tracks_registry(content: str) -> Optional[str]:
    """Return the first active track ID from a `tracks.md` table, or `None`."""
    in_progress = _TRACK_IN_PROGRESS_RE.findall(content)
    if in_progress:
        return in_progress[0]

    pending = [
        track_id
        for track_id in _TRACK_PENDING_RE.findall(content)
        if track_id not in in_progress
    ]
    if pending:
        return pending[0]
    return None


def get_active_track(
    repo_root: Path,
    planning: Optional[PlanningProfile] = None,
) -> Optional[str]:
    """Resolve the active track ID from the registry or sorted tracks directory."""
    profile = planning if planning is not None else PlanningProfile()
    root = Path(repo_root)

    registry_path = root / profile.tracks_registry
    if registry_path.is_file():
        active = parse_tracks_registry(registry_path.read_text(encoding="utf-8"))
        if active is not None:
            return active

    tracks_dir = root / profile.tracks_dir
    if tracks_dir.is_dir():
        track_names = sorted(
            entry.name
            for entry in tracks_dir.iterdir()
            if entry.is_dir() and not entry.name.startswith(".")
        )
        if track_names:
            return track_names[0]

    return None


# ---------------------------------------------------------------------------
# Plan Markdown & Track Plan Parsing
# ---------------------------------------------------------------------------


def is_checkpoint_task(task_desc: str) -> bool:
    """Return True when `task_desc` denotes a phase checkpoint or manual verification."""
    desc_lower = task_desc.lower().strip()
    return (
        "manual verification" in desc_lower
        or "protocol in workflow.md" in desc_lower
        or "checkpoint end of phase" in desc_lower
        or "checkpoint verification" in desc_lower
        or desc_lower.startswith(
            ("checkpoint:", "checkpoint ", "conductor - user manual verification")
        )
        or desc_lower == "checkpoint"
        or bool(_CHECKPOINT_PREFIX_RE.match(desc_lower))
        or bool(_CHECKPOINT_TASK_WORD_RE.search(desc_lower))
    )


def _parse_task_line(line: str, task_num: int) -> Optional[_TaskBuilder]:
    """Parse a top-level Markdown task checkbox line into a mutable builder."""
    task_match = TASK_RE.match(line)
    if not task_match:
        return None

    raw_char = task_match.group(1).lower()
    task_desc = task_match.group(2).strip()
    status, status_char = _STATUS_MAP.get(raw_char, ("pending", " "))

    exempt_cat: Optional[str] = None
    exempt_match = EXEMPT_RE.search(task_desc)
    if exempt_match:
        exempt_cat = exempt_match.group(1).lower()
        task_desc = EXEMPT_RE.sub("", task_desc).strip()

    commit_sha: Optional[str] = None
    sha_match = TASK_SHA_RE.search(task_desc)
    # Only strip bare trailing hex tokens on complete/skipped tasks so pending hex words stay intact.
    if not sha_match and status in ("complete", "skipped"):
        sha_match = TASK_SHA_BARE_RE.search(task_desc)

    if sha_match:
        commit_sha = next((g for g in sha_match.groups() if g is not None), None)
        clean_desc = task_desc[: sha_match.start()].strip()
    else:
        clean_desc = task_desc

    clean_desc = _TRAILING_CHECKPOINT_RE.sub("", clean_desc).strip()
    clean_desc = _WHITESPACE_RE.sub(" ", clean_desc).strip()

    return _TaskBuilder(
        task_num=task_num,
        description=clean_desc,
        status=status,
        status_char=status_char,
        is_checkpoint=is_checkpoint_task(clean_desc),
        commit_sha=commit_sha,
        exempt=exempt_cat,
        raw_line=line.strip(),
    )


def parse_plan_markdown(content: str) -> dict[int, PhaseInfo]:
    """Parse Conductor `plan.md` Markdown into frozen `PhaseInfo` records keyed by phase number."""
    builders: dict[int, _PhaseBuilder] = {}
    current_phase: Optional[_PhaseBuilder] = None
    in_review_fixes = False

    for line in content.splitlines():
        phase_match = PHASE_HEADER_RE.match(line)
        if phase_match:
            raw_num = phase_match.group(2)
            raw_title = phase_match.group(3).strip()

            cp_match = CHECKPOINT_HEADER_RE.search(raw_title)
            checkpoint_sha: Optional[str] = None
            if cp_match:
                checkpoint_sha = cp_match.group(1) or cp_match.group(2)
                phase_title = raw_title[: cp_match.start()].strip()
            else:
                phase_title = raw_title

            if raw_num is None and _REVIEW_FIXES_RE.match(phase_title) and current_phase is not None:
                in_review_fixes = True
                continue

            in_review_fixes = False
            raw_heading = CHECKPOINT_HEADER_RE.sub("", line.strip()).strip()
            phase_num = int(raw_num) if raw_num else ((max(builders.keys()) + 1) if builders else 1)

            current_phase = _PhaseBuilder(
                phase_num=phase_num,
                name=phase_title,
                checkpoint_sha=checkpoint_sha,
                raw_heading=raw_heading,
            )
            builders[phase_num] = current_phase
            continue

        if current_phase is None:
            continue

        target_list = current_phase.review_fixes if in_review_fixes else current_phase.tasks

        subtask_match = SUBTASK_RE.match(line)
        if subtask_match and target_list:
            target_list[-1].subtasks.append(subtask_match.group(2).strip())
            continue

        task_builder = _parse_task_line(line, task_num=len(target_list) + 1)
        if task_builder is not None:
            target_list.append(task_builder)

    return {num: builder.freeze() for num, builder in builders.items()}


def parse_plan_file(plan_path: Optional[Path]) -> dict[int, PhaseInfo]:
    """Read and parse a `plan.md` file, returning `{}` when missing or not a file."""
    if plan_path is None or not Path(plan_path).is_file():
        return {}
    return parse_plan_markdown(Path(plan_path).read_text(encoding="utf-8"))


def parse_track_plan(
    track_or_plan_path: Path,
    track_name: Optional[str] = None,
) -> TrackPlan:
    """Parse a track directory or explicit `plan.md` path into a frozen `TrackPlan`."""
    p = Path(track_or_plan_path)
    if p.is_dir() or (p.name != "plan.md" and not p.is_file()):
        track_dir = p
        plan_path = p / "plan.md"
    else:
        plan_path = p
        track_dir = p.parent

    resolved_name = track_name or track_dir.name
    return TrackPlan(
        track_name=resolved_name,
        track_dir=track_dir,
        plan_path=plan_path,
        phases=parse_plan_file(plan_path),
    )


def get_active_phase(
    phases: dict[int, PhaseInfo],
    target_phase: Optional[int] = None,
) -> Optional[PhaseInfo]:
    """Return `target_phase` if specified, otherwise the first incomplete phase in ascending order."""
    if target_phase is not None:
        return phases.get(target_phase)
    for num in sorted(phases.keys()):
        if not phases[num].is_complete:
            return phases[num]
    return None


def get_pending_tasks(phase: PhaseInfo) -> tuple[TaskInfo, ...]:
    """Return all pending or in-progress tasks belonging to `phase`."""
    return tuple(task for task in phase.tasks if task.status in ("pending", "in_progress"))


def find_next_pending_task(
    phases: dict[int, PhaseInfo],
) -> Optional[tuple[int, TaskInfo]]:
    """Return `(phase_num, task)` for the first pending or in-progress task in incomplete phases."""
    for phase_num in sorted(phases.keys()):
        phase = phases[phase_num]
        if phase.is_complete:
            continue
        pending = get_pending_tasks(phase)
        if pending:
            return (phase_num, pending[0])
    return None


# ---------------------------------------------------------------------------
# Path Classification
# ---------------------------------------------------------------------------


def _normalize_path(filepath: str) -> str:
    """Normalize quotes, backticks, renames, backslashes, and leading `./` segments."""
    norm = filepath.strip().strip("'\"`")
    if " -> " in norm:
        norm = norm.split(" -> ")[-1].strip().strip("'\"`")
    norm = norm.replace("\\", "/")
    while norm.startswith("./"):
        norm = norm[2:]
    return norm


def is_metadata_path(
    filepath: str,
    path_rules: Optional[PathRules] = None,
) -> bool:
    """Return True if `filepath` begins with any configured metadata prefix."""
    rules = path_rules if path_rules is not None else PathRules()
    norm = _normalize_path(filepath)
    if not norm:
        return False
    return any(norm.startswith(prefix) for prefix in rules.metadata_prefixes)


def is_test_file(
    filepath: str,
    path_rules: Optional[PathRules] = None,
) -> bool:
    """Return True if `filepath` is a test file (not a bare directory) under `PathRules`."""
    rules = path_rules if path_rules is not None else PathRules()
    norm = _normalize_path(filepath)
    if not norm or norm.endswith("/"):
        return False

    parts = norm.split("/")
    dir_parts = set(parts[:-1])
    basename = parts[-1]

    if any(norm.endswith(suffix) for suffix in rules.test_suffixes):
        return True

    has_valid_ext = "." in basename and (
        not rules.code_extensions or norm.endswith(rules.code_extensions)
    )
    if not has_valid_ext:
        return False

    if dir_parts & set(rules.test_dirs):
        return True

    return any(basename.startswith(prefix) for prefix in rules.test_prefixes)


# ---------------------------------------------------------------------------
# Backtick Spans & Post-Execution Extraction
# ---------------------------------------------------------------------------


def extract_backtick_spans(
    text_or_lines: Union[str, Sequence[str]],
) -> tuple[str, ...]:
    """Extract non-empty backtick spans verbatim, deduplicated in encounter order."""
    lines = text_or_lines.splitlines() if isinstance(text_or_lines, str) else text_or_lines
    seen: set[str] = set()
    spans: list[str] = []

    for line in lines:
        for raw_span in _BACKTICK_SPAN_RE.findall(line):
            span = raw_span.strip()
            if span and span not in seen:
                seen.add(span)
                spans.append(span)

    return tuple(spans)


def extract_post_execution_info(
    content_or_path: Union[str, Path],
    task_desc: str = "",
) -> tuple[Optional[str], Optional[str]]:
    """Extract `(section_ref, explicit_commit_msg)` from blueprint content or file path."""
    if isinstance(content_or_path, Path):
        if not content_or_path.is_file():
            return (None, None)
        content = content_or_path.read_text(encoding="utf-8")
    else:
        content = content_or_path

    if task_desc:
        clean_task = EXEMPT_RE.sub("", task_desc).strip()
        clean_task = TASK_SHA_RE.sub("", clean_task).strip()
        clean_task = TASK_SHA_BARE_RE.sub("", clean_task).strip()
        clean_task = _WHITESPACE_RE.sub(" ", clean_task).strip()
        if clean_task and clean_task.lower() not in content.lower():
            return (None, None)

    match = _POST_EXEC_SECTION_RE.search(content)
    if not match:
        return (None, None)

    section_num = match.group(1)
    section_title = match.group(2).strip()
    section_ref = (
        f"Section {section_num} ({section_title})"
        if section_num
        else f"the '{section_title}' section"
    )

    start_pos = match.start()
    next_heading = _NEXT_H2_RE.search(content[match.end() :])
    post_exec_block = (
        content[start_pos : match.end() + next_heading.start()]
        if next_heading
        else content[start_pos:]
    )

    explicit_commit: Optional[str] = None
    for _, commit_msg in _GIT_COMMIT_MSG_RE.findall(post_exec_block):
        if not commit_msg.startswith("conductor(") and not commit_msg.startswith("conductor/"):
            explicit_commit = commit_msg
            break

    return (section_ref, explicit_commit)


# ---------------------------------------------------------------------------
# Task Blueprint Parsing
# ---------------------------------------------------------------------------


def _split_command_tokens(text: str) -> list[str]:
    """Split a command or backtick span into shell-like tokens, falling back on unbalanced quotes."""
    try:
        return shlex.split(text)
    except ValueError:
        return text.split()


def _collect_test_paths_from_tokens(
    tokens: Sequence[str],
    rules: PathRules,
    collected: list[str],
    seen: set[str],
) -> None:
    """Collect normalized, non-metadata test file paths from command or prose tokens."""
    for token in tokens:
        candidates = [token]
        if "=" in token:
            candidates.append(token.split("=", 1)[1])
        for cand in candidates:
            norm = _normalize_path(cand)
            if not norm or norm in seen:
                continue
            if is_metadata_path(norm, rules):
                continue
            if is_test_file(norm, rules):
                seen.add(norm)
                collected.append(norm)


def _prune_bare_basenames(paths: list[str]) -> tuple[str, ...]:
    """Drop bare filenames when a qualified `<dir>/<filename>` path is also present."""
    return tuple(
        p
        for p in paths
        if "/" in p or not any(other.endswith(f"/{p}") for other in paths if other != p)
    )


def parse_task_blueprint_markdown(
    content: str,
    plan_path: Path,
    *,
    path_rules: Optional[PathRules] = None,
    task_desc: str = "",
    subtasks: Sequence[str] = (),
) -> TaskBlueprint:
    """Parse a task blueprint Markdown string into a frozen `TaskBlueprint`."""
    rules = path_rules if path_rules is not None else PathRules()
    if not content.strip():
        return TaskBlueprint(plan_path=plan_path)

    target_files: list[str] = []
    seen_targets: set[str] = set()
    for match in _TARGET_FILE_RE.findall(content):
        raw_path = next((g for g in match if g), "")
        norm = _normalize_path(raw_path)
        if norm and not is_metadata_path(norm, rules) and norm not in seen_targets:
            seen_targets.add(norm)
            target_files.append(norm)

    verification_commands: list[str] = []
    seen_cmds: set[str] = set()
    proto_match = _VERIFICATION_SECTION_RE.search(content)
    if proto_match:
        for block in _BASH_BLOCK_RE.findall(proto_match.group(1)):
            flattened = _LINE_CONTINUATION_RE.sub(" ", block)
            for raw_line in flattened.splitlines():
                cmd_line = raw_line.strip()
                if cmd_line and not cmd_line.startswith("#") and cmd_line not in seen_cmds:
                    seen_cmds.add(cmd_line)
                    verification_commands.append(cmd_line)

    referenced_tests: list[str] = []
    seen_tests: set[str] = set()
    for cmd in verification_commands:
        _collect_test_paths_from_tokens(
            _split_command_tokens(cmd),
            rules,
            referenced_tests,
            seen_tests,
        )

    if not referenced_tests and subtasks:
        for span in extract_backtick_spans(subtasks):
            _collect_test_paths_from_tokens(
                _split_command_tokens(span),
                rules,
                referenced_tests,
                seen_tests,
            )
        prose_tokens = [
            tok.strip("()[]{}.,;:")
            for subtask in subtasks
            for tok in subtask.split()
        ]
        _collect_test_paths_from_tokens(prose_tokens, rules, referenced_tests, seen_tests)

    post_exec_section, post_exec_commit_msg = extract_post_execution_info(
        content,
        task_desc=task_desc,
    )

    return TaskBlueprint(
        plan_path=plan_path,
        target_files=tuple(target_files),
        referenced_test_files=_prune_bare_basenames(referenced_tests),
        verification_commands=tuple(verification_commands),
        post_exec_section=post_exec_section,
        post_exec_commit_msg=post_exec_commit_msg,
    )


def parse_task_blueprint(
    plan_path: Optional[Path],
    *,
    path_rules: Optional[PathRules] = None,
    task_desc: str = "",
    subtasks: Sequence[str] = (),
) -> TaskBlueprint:
    """Read and parse a task blueprint file, returning an empty `TaskBlueprint` when missing."""
    if plan_path is None:
        return TaskBlueprint(plan_path=Path(""))
    resolved = Path(plan_path)
    if not resolved.is_file():
        return TaskBlueprint(plan_path=resolved)
    return parse_task_blueprint_markdown(
        resolved.read_text(encoding="utf-8"),
        resolved,
        path_rules=path_rules,
        task_desc=task_desc,
        subtasks=subtasks,
    )


# ---------------------------------------------------------------------------
# Review Severity Parsing
# ---------------------------------------------------------------------------


def parse_review_severity(
    report_text: str,
    *,
    severity_pattern: Optional[str] = None,
) -> tuple[bool, tuple[str, ...]]:
    """Match strict Critical/High review headings and return `(has_findings, findings)`."""
    pattern_str = severity_pattern or SupervisorProfile().review_severity_pattern
    pattern = re.compile(pattern_str, re.IGNORECASE)
    findings = tuple(
        stripped
        for line in report_text.splitlines()
        if (stripped := line.strip()) and pattern.match(stripped)
    )
    return (len(findings) > 0, findings)


__all__ = [
    "extract_backtick_spans",
    "extract_post_execution_info",
    "find_next_pending_task",
    "get_active_phase",
    "get_active_track",
    "get_pending_tasks",
    "is_checkpoint_task",
    "is_metadata_path",
    "is_test_file",
    "parse_plan_file",
    "parse_plan_markdown",
    "parse_review_severity",
    "parse_task_blueprint",
    "parse_task_blueprint_markdown",
    "parse_track_plan",
    "parse_tracks_registry",
]
