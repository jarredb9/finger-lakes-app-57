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
import codecs
from dataclasses import dataclass, field
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import select
import shlex
import signal
import subprocess
import sys
import threading
import time
from typing import Any, Dict, List, Mapping, Optional, Set, TextIO, Tuple, Union


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

DEFAULT_MODEL_FAMILY: str = "gemini-4-hydrogen"

ROLE_EFFORT_MAP: Dict[str, str] = {
    "plan": "high",
    "exec": "high",
    "checkpoint": "medium",
    "review": "high",
}

DEFAULT_PLAN_MODEL: str = f"{DEFAULT_MODEL_FAMILY}-{ROLE_EFFORT_MAP['plan']}"
DEFAULT_EXEC_MODEL: str = f"{DEFAULT_MODEL_FAMILY}-{ROLE_EFFORT_MAP['exec']}"
DEFAULT_CHECKPOINT_MODEL: str = f"{DEFAULT_MODEL_FAMILY}-{ROLE_EFFORT_MAP['checkpoint']}"
DEFAULT_REVIEW_MODEL: str = f"{DEFAULT_MODEL_FAMILY}-{ROLE_EFFORT_MAP['review']}"

DEFAULT_BRAIN_DIR: Path = Path.home() / ".gemini" / "antigravity-cli" / "brain"

DEFAULT_HEARTBEAT_INTERVAL: float = 30.0

REVIEW_SEVERITY_PATTERN: str = r"^###\s+\[?(Critical|High)(?:\]|(?=$|[\s:]))"


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


@dataclass
class ReviewResult:
    report_path: Path
    conversation_id: Optional[str]
    has_critical_or_high: bool
    findings: List[str] = field(default_factory=list)
    exit_code: int = 0


_STDOUT_LOCK = threading.Lock()


class DualLogger:
    """Formats progress banners/status/error lines to terminal streams and tees unredacted output to a log file."""

    def __init__(
        self,
        log_file: Optional[Path] = None,
        stdout_stream: Optional[TextIO] = None,
        stderr_stream: Optional[TextIO] = None,
    ) -> None:
        self.log_file: Optional[Path] = Path(log_file) if log_file is not None else None
        self._stdout_stream: Optional[TextIO] = stdout_stream
        self._stderr_stream: Optional[TextIO] = stderr_stream
        self._lock = threading.Lock()

    def _get_stdout(self) -> TextIO:
        return self._stdout_stream if self._stdout_stream is not None else sys.stdout

    def _get_stderr(self) -> TextIO:
        return self._stderr_stream if self._stderr_stream is not None else sys.stderr

    def _write_stream(self, stream: TextIO, text: str) -> None:
        with self._lock:
            stream.write(text)
            stream.flush()

    def write_stdout(self, text: str) -> None:
        """Thread-safely writes and flushes text to the configured stdout stream."""
        self._write_stream(self._get_stdout(), text)

    def write_stderr(self, text: str) -> None:
        """Thread-safely writes and flushes text to the configured stderr stream."""
        self._write_stream(self._get_stderr(), text)

    def _append_file(self, text: str) -> None:
        if self.log_file is None:
            return
        with self._lock:
            try:
                self.log_file.parent.mkdir(parents=True, exist_ok=True)
                with open(self.log_file, "a", encoding="utf-8") as f:
                    f.write(text)
                    f.flush()
            except OSError:
                pass

    def log_banner(self, title: str, subtitle: Optional[str] = None) -> None:
        timestamp = time.strftime("%H:%M:%S")
        border = "=" * 72
        lines = [f"\n{border}", f"  [{timestamp}] {title}"]
        if subtitle:
            lines.append(f"  {subtitle}")
        lines.append(f"{border}\n")
        payload = "\n".join(lines)
        self.write_stdout(payload)
        self._append_file(payload)

    def log_status(self, message: str) -> None:
        timestamp = time.strftime("%H:%M:%S")
        line = f"[conductor-auto] [{timestamp}] {message}\n"
        self.write_stdout(line)
        self._append_file(line)

    def log_error(self, message: str) -> None:
        """Logs a timestamped error line to stderr and persists it to the runner log file."""
        timestamp = time.strftime("%H:%M:%S")
        line = f"[conductor-auto] [{timestamp}] ERROR: {message}\n"
        self.write_stderr(line)
        self._append_file(line)

    def write_raw(self, chunk: str, to_stdout: bool = False) -> None:
        self._append_file(chunk)
        if to_stdout:
            self.write_stdout(chunk)


@dataclass(frozen=True)
class TurnStreamConfig:
    """Groups streaming, dual-logging, and heartbeat options for an agy turn."""

    stream: bool = False
    logger: Optional[DualLogger] = None
    heartbeat_interval: float = DEFAULT_HEARTBEAT_INTERVAL


# ---------------------------------------------------------------------------
# Track & Registry Resolution
# ---------------------------------------------------------------------------

def resolve_track_dir(
    track_name: Optional[str],
    cwd: Optional[Path] = None,
) -> Optional[Path]:
    """Resolves track directory path whether active or archived."""
    if not track_name:
        return None
    base_root = cwd or PROJECT_ROOT
    p = Path(track_name)
    if p.is_dir() and (p / "plan.md").exists():
        return p.resolve()
    if not p.is_absolute():
        for root in ([base_root, PROJECT_ROOT] if cwd else [PROJECT_ROOT]):
            p_rel = (root / p).resolve()
            if p_rel.is_dir() and (p_rel / "plan.md").exists():
                return p_rel
    for root in ([base_root, PROJECT_ROOT] if cwd else [PROJECT_ROOT]):
        tracks_dir = (root / "conductor" / "tracks" / track_name).resolve()
        if tracks_dir.is_dir():
            return tracks_dir
        archive_dir = (root / "conductor" / "archive" / track_name).resolve()
        if archive_dir.is_dir():
            return archive_dir
    return (base_root / "conductor" / "tracks" / track_name).resolve()


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


def _is_docs_exempt_task(task: TaskInfo) -> bool:
    """Returns True when a TaskInfo carries the [exempt: docs] category."""
    return (task.exempt or "").lower().strip() == "docs"


def should_skip_tier1_plan(
    task: TaskInfo,
    force_plan: bool = False,
    skip_plan: bool = False,
) -> bool:
    """Returns True if Tier 1 planning should be skipped for the task."""
    if force_plan:
        return False
    if skip_plan:
        return True
    if _is_docs_exempt_task(task):
        return True
    return False


def is_docs_only_phase(phase: PhaseInfo) -> bool:
    """Returns True if all active (non-checkpoint, non-skipped) tasks in the phase are [exempt: docs]."""
    active_tasks = [t for t in phase.tasks if not t.is_checkpoint and t.status != "skipped"]
    return bool(active_tasks) and all(_is_docs_exempt_task(t) for t in active_tasks)


def should_skip_gate2_review(
    phase: PhaseInfo,
    no_review: bool = False,
    force_review: bool = False,
) -> bool:
    """Returns True if Gate 2 phase review should be skipped."""
    if no_review:
        return True
    if force_review:
        return False
    if is_docs_only_phase(phase):
        return True
    return False


def _format_gate2_skip_reason(phase_num: int, no_review: bool) -> str:
    """Returns the human-readable reason Gate 2 review was skipped for a phase."""
    if no_review:
        return f"Phase {phase_num} (--no-review)"
    return f"Phase {phase_num} (documentation-only phase; pass --force-review to override)"


# ---------------------------------------------------------------------------
# Subprocess Protocol & Command Construction
# ---------------------------------------------------------------------------

def generate_turn_prompt(
    track: str,
    phase_num: int,
    task_num: Optional[int] = None,
    mode: str = "plan",
    unattended: bool = False,
    cwd: Optional[Path] = None,
    skip_plan: bool = False,
) -> str:
    """Invokes scripts/agent/generate-prompt.py via subprocess to obtain turn prompt."""
    work_dir = cwd or PROJECT_ROOT
    gen_script = work_dir / "scripts" / "agent" / "generate-prompt.py"
    if not gen_script.exists():
        gen_script = PROJECT_ROOT / "scripts" / "agent" / "generate-prompt.py"

    normalized_mode = mode.lstrip("-")
    mode_flag = f"--{normalized_mode}"
    cmd = [
        sys.executable,
        str(gen_script),
        str(track),
        str(phase_num),
    ]
    if task_num is not None:
        cmd.append(str(task_num))
    cmd.append(mode_flag)
    if normalized_mode == "checkpoint":
        cmd.append("--exec")
    if unattended:
        cmd.append("--unattended")
    if skip_plan:
        cmd.append("--skip-plan")

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
    prompt: str = "",
    extra_flags: Optional[List[str]] = None,
    output_format: Optional[str] = None,
    print_timeout: Optional[str] = None,
) -> List[str]:
    """Builds agy CLI command ensuring configuration flags strictly precede --print <prompt>."""
    cmd = ["agy", "--mode", mode, "--model", model, "--dangerously-skip-permissions"]
    if output_format:
        cmd.extend(["--output-format", output_format])
    if print_timeout:
        cmd.extend(["--print-timeout", print_timeout])
    if extra_flags:
        cmd.extend(extra_flags)
    cmd.extend(["--print", prompt])
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


def _has_real_fd(stream_obj: Any) -> bool:
    """Returns True if stream_obj exposes a non-negative integer OS file descriptor."""
    if stream_obj is None or not hasattr(stream_obj, "fileno"):
        return False
    try:
        fd = stream_obj.fileno()
        return isinstance(fd, int) and not isinstance(fd, bool) and fd >= 0
    except Exception:
        return False


def _open_turn_log(log_path: Optional[Path]) -> Optional[TextIO]:
    """Opens a turn log file for appending, creating parent directories safely."""
    if log_path is None:
        return None
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        return open(log_path, "a", encoding="utf-8")
    except OSError:
        return None


def _format_duration(seconds: float) -> str:
    """Formats elapsed seconds cleanly as '45s' or '2m05s'."""
    total = max(0, int(seconds))
    mins, secs = divmod(total, 60)
    if mins == 0:
        return f"{secs}s"
    hours, mins = divmod(mins, 60)
    if hours == 0:
        return f"{mins}m{secs:02d}s"
    return f"{hours}h{mins:02d}m{secs:02d}s"


def _summarize_tool_params(params: Any, max_len: int = 72) -> str:
    """Extracts a concise, single-line parameter hint from a stream-json tool_info dict."""
    if not isinstance(params, dict) or not params:
        return ""
    priority_keys = (
        "CommandLine",
        "Path",
        "TargetFile",
        "AbsolutePath",
        "DirectoryPath",
        "SearchPath",
        "Query",
        "Pattern",
        "Url",
        "toolSummary",
    )
    val: Any = None
    for key in priority_keys:
        if key in params and params[key] is not None:
            val = params[key]
            break
    if val is None:
        for candidate in params.values():
            if isinstance(candidate, (str, int, float, bool)):
                val = candidate
                break
    if val is None:
        return ""
    text = re.sub(r"\s+", " ", str(val)).strip()
    if len(text) > max_len:
        text = text[: max_len - 3] + "..."
    return text


class _StreamJsonTracker:
    """Incrementally parses agy --output-format stream-json NDJSON lines into live terminal updates."""

    _KNOWN_EVENTS = frozenset({"init", "step_update", "result", "error"})

    def __init__(self) -> None:
        self.saw_stream_json: bool = False
        self.conversation_id: Optional[str] = None
        self.final_response: Optional[str] = None
        self.text_deltas: List[str] = []
        self.last_activity: str = "starting"
        self._init_logged: bool = False

    def process_line(self, line: str) -> List[str]:
        """Processes one stdout line; returns formatted terminal lines (or passes plain text through)."""
        stripped = line.strip()
        if not stripped.startswith("{"):
            return [line]
        try:
            payload = json.loads(stripped)
        except json.JSONDecodeError:
            return [line]

        if not isinstance(payload, dict) or payload.get("event") not in self._KNOWN_EVENTS:
            return [line]

        self.saw_stream_json = True
        ts = time.strftime("%H:%M:%S")
        event = payload.get("event")

        if event == "init":
            return self._handle_init(payload, ts)
        if event == "step_update":
            return self._handle_step_update(payload.get("step_update") or {}, ts)
        if event == "result":
            return self._handle_result(payload.get("result") or {}, ts)
        if event == "error":
            self.last_activity = "error"
            err_msg = payload.get("message") or payload.get("error") or stripped
            return [f"[{ts}] [agy] error: {err_msg}\n"]
        return []

    def _handle_init(self, payload: Dict[str, Any], ts: str) -> List[str]:
        cid = payload.get("conversation_id")
        if cid:
            self.conversation_id = str(cid)
        init_info = payload.get("init") if isinstance(payload.get("init"), dict) else {}
        model = init_info.get("model", "unknown")
        self.last_activity = "initialized"
        if self._init_logged:
            return []
        self._init_logged = True
        cid_display = self.conversation_id or "unknown"
        return [f"[{ts}] [agy] Session initialized (conversation: {cid_display}, model: {model})\n"]

    def _handle_step_update(self, su: Dict[str, Any], ts: str) -> List[str]:
        if not isinstance(su, dict):
            return []
        step_type = su.get("step_type", "")
        state = su.get("state", "")
        step_idx = su.get("step_index")

        if step_type == "tool":
            tool_info = su.get("tool_info") if isinstance(su.get("tool_info"), dict) else {}
            tool_name = su.get("tool_name") or tool_info.get("name") or "tool"
            if state == "ACTIVE":
                summary = _summarize_tool_params(tool_info.get("parameters"))
                self.last_activity = f"tool:{tool_name}"
                detail = f" ({summary})" if summary else ""
                return [f"[{ts}] [agy] -> tool: {tool_name}{detail}\n"]
            if state == "DONE":
                dur = su.get("duration_seconds")
                dur_str = f" ({dur:.1f}s)" if isinstance(dur, (int, float)) else ""
                self.last_activity = f"tool:{tool_name}:done"
                return [f"[{ts}] [agy] <- tool: {tool_name} done{dur_str}\n"]
            return []

        if step_type == "agent_response":
            delta = su.get("text_delta")
            if isinstance(delta, str) and delta:
                self.text_deltas.append(delta)
            if state == "ACTIVE":
                self.last_activity = "responding"
                return []
            if state == "DONE":
                dur = su.get("duration_seconds")
                usage = su.get("usage") if isinstance(su.get("usage"), dict) else {}
                total_tokens = usage.get("total_tokens")
                parts: List[str] = []
                if isinstance(dur, (int, float)):
                    parts.append(f"{dur:.1f}s")
                if isinstance(total_tokens, int):
                    parts.append(f"{total_tokens} tokens")
                self.last_activity = "responded"
                if parts:
                    idx_label = f"step {step_idx}" if step_idx is not None else "step"
                    return [f"[{ts}] [agy] {idx_label}: agent_response ({', '.join(parts)})\n"]
            return []

        if state == "DONE" and step_type:
            self.last_activity = step_type
        return []

    def _handle_result(self, res: Dict[str, Any], ts: str) -> List[str]:
        if not isinstance(res, dict):
            return []
        cid = res.get("conversation_id")
        if cid and not self.conversation_id:
            self.conversation_id = str(cid)
        status = res.get("status", "DONE")
        dur = res.get("duration_seconds")
        num_turns = res.get("num_turns")
        usage = res.get("usage") if isinstance(res.get("usage"), dict) else {}
        total_tokens = usage.get("total_tokens")

        meta: List[str] = [str(status)]
        if isinstance(dur, (int, float)):
            meta.append(f"{dur:.1f}s")
        if isinstance(num_turns, int):
            meta.append(f"turns={num_turns}")
        if isinstance(total_tokens, int):
            meta.append(f"tokens={total_tokens}")

        self.last_activity = f"finished:{status}"
        lines = [f"[{ts}] [agy] Turn finished ({', '.join(meta)})\n"]

        response = res.get("response")
        if isinstance(response, str):
            self.final_response = response
            if response:
                lines.append(response if response.endswith("\n") else f"{response}\n")
        return lines

    def get_clean_stdout(self, raw_stdout: str) -> str:
        """Returns extracted assistant response text when stream-json was active, else raw_stdout."""
        if not self.saw_stream_json:
            return raw_stdout
        if self.final_response:
            return self.final_response
        if self.text_deltas:
            return "".join(self.text_deltas)
        if self.final_response is not None:
            return self.final_response
        return raw_stdout


class _TurnOutputSink:
    """Thread-safe sink for turn log persistence, stream-json parsing, and live terminal output."""

    def __init__(
        self,
        log_handle: Optional[TextIO],
        logger: Optional[DualLogger],
        tracker: _StreamJsonTracker,
    ) -> None:
        self._log_handle = log_handle
        self._log_lock = threading.Lock()
        self._logger = logger
        self.tracker = tracker

    def write_log(self, text: str) -> None:
        if self._log_handle is None:
            return
        with self._log_lock:
            self._log_handle.write(text)
            self._log_handle.flush()

    def emit_terminal(self, text: str) -> None:
        if self._logger is not None:
            self._logger.write_stdout(text)
            return
        with _STDOUT_LOCK:
            sys.stdout.write(text)
            sys.stdout.flush()

    def emit_stdout_line(self, line: str, stdout_chunks: List[str]) -> None:
        stdout_chunks.append(line)
        self.write_log(line)
        for term_line in self.tracker.process_line(line):
            self.emit_terminal(term_line)

    def emit_stderr_line(self, err_line: str, stderr_chunks: List[str]) -> None:
        stderr_chunks.append(err_line)
        self.write_log(f"[STDERR] {err_line}")
        stripped_err = err_line.rstrip("\r\n")
        if stripped_err:
            self.emit_terminal(f"[{time.strftime('%H:%M:%S')}] [agy:stderr] {stripped_err}\n")

    def emit_heartbeat(self, pid: int, elapsed: float, timeout: float) -> None:
        msg = (
            f"Still running (pid={pid}, elapsed={_format_duration(elapsed)}"
            f"/{_format_duration(timeout)}, state={self.tracker.last_activity})"
        )
        if self._logger is not None:
            self._logger.log_status(msg)
            return
        ts = time.strftime("%H:%M:%S")
        self.emit_terminal(f"[conductor-auto] [{ts}] {msg}\n")


def _drain_stdout_select(
    proc: subprocess.Popen,
    sink: _TurnOutputSink,
    stdout_chunks: List[str],
    start_time: float,
    deadline: float,
    timeout: float,
    heartbeat_interval: float,
) -> None:
    """Drains a real file-descriptor stdout pipe via select() with heartbeat wakeups and timeout enforcement."""
    assert proc.stdout is not None
    fd = proc.stdout.fileno()
    decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
    pending_line = ""
    eof = False
    while not eof:
        now = time.monotonic()
        remaining = deadline - now
        if remaining <= 0:
            _terminate_process_group(proc.pid, proc)
            raise ProcessExecutionError(f"Turn timed out after {timeout}s")

        wait_slice = (
            min(remaining, heartbeat_interval)
            if heartbeat_interval and heartbeat_interval > 0
            else remaining
        )
        ready, _, _ = select.select([fd], [], [], wait_slice)
        if not ready:
            now_after = time.monotonic()
            if now_after >= deadline:
                _terminate_process_group(proc.pid, proc)
                raise ProcessExecutionError(f"Turn timed out after {timeout}s")
            sink.emit_heartbeat(proc.pid, now_after - start_time, timeout)
            continue

        raw_chunk = os.read(fd, 4096)
        if not raw_chunk:
            eof = True
            decoded = decoder.decode(b"", final=True)
        else:
            decoded = decoder.decode(raw_chunk, final=False)

        pending_line += decoded
        lines_to_emit = pending_line.splitlines(keepends=True)
        if not eof and lines_to_emit and not lines_to_emit[-1].endswith("\n"):
            pending_line = lines_to_emit.pop()
        else:
            pending_line = ""

        for line in lines_to_emit:
            sink.emit_stdout_line(line, stdout_chunks)

        if time.monotonic() > deadline:
            _terminate_process_group(proc.pid, proc)
            raise ProcessExecutionError(f"Turn timed out after {timeout}s")


def _drain_stdout_readline(
    proc: subprocess.Popen,
    sink: _TurnOutputSink,
    stdout_chunks: List[str],
    deadline: float,
    timeout: float,
) -> None:
    """Drains non-fd stdout streams (such as StringIO mocks) via readline()."""
    assert proc.stdout is not None
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            _terminate_process_group(proc.pid, proc)
            raise ProcessExecutionError(f"Turn timed out after {timeout}s")

        line = proc.stdout.readline()
        if line == "":
            break

        sink.emit_stdout_line(line, stdout_chunks)

        if time.monotonic() > deadline:
            _terminate_process_group(proc.pid, proc)
            raise ProcessExecutionError(f"Turn timed out after {timeout}s")


def _stream_agy_process(
    proc: subprocess.Popen,
    prompt: str,
    mode: str,
    model: str,
    timeout: float,
    effective_log_file: Optional[Path],
    logger: Optional[DualLogger],
    heartbeat_interval: float = DEFAULT_HEARTBEAT_INTERVAL,
) -> Tuple[int, str, str]:
    """Streams agy subprocess stdout/stderr incrementally with heartbeats and timeout enforcement."""
    start_time = time.monotonic()
    deadline = start_time + timeout
    log_handle = _open_turn_log(effective_log_file)
    stdout_chunks: List[str] = []
    stderr_chunks: List[str] = []
    stderr_thread: Optional[threading.Thread] = None
    tracker = _StreamJsonTracker()
    sink = _TurnOutputSink(log_handle=log_handle, logger=logger, tracker=tracker)

    try:
        sink.write_log(
            f"=== AGY TURN [{mode}] [{model}] ===\n"
            f"PROMPT:\n{prompt}\n"
            f"STDOUT:\n"
        )

        if proc.stdin is not None:
            try:
                proc.stdin.write(prompt)
                proc.stdin.flush()
            except BrokenPipeError:
                pass
            finally:
                try:
                    proc.stdin.close()
                except Exception:
                    pass

        if proc.stderr is not None and _has_real_fd(proc.stderr):
            def _drain_stderr() -> None:
                try:
                    for err_line in proc.stderr:
                        sink.emit_stderr_line(err_line, stderr_chunks)
                except Exception:
                    pass

            stderr_thread = threading.Thread(target=_drain_stderr, daemon=True)
            stderr_thread.start()

        if proc.stdout is not None:
            if _has_real_fd(proc.stdout):
                _drain_stdout_select(
                    proc=proc,
                    sink=sink,
                    stdout_chunks=stdout_chunks,
                    start_time=start_time,
                    deadline=deadline,
                    timeout=timeout,
                    heartbeat_interval=heartbeat_interval,
                )
            else:
                _drain_stdout_readline(
                    proc=proc,
                    sink=sink,
                    stdout_chunks=stdout_chunks,
                    deadline=deadline,
                    timeout=timeout,
                )

        remaining = max(0.0, deadline - time.monotonic())
        try:
            wait_rc = proc.wait(timeout=remaining)
        except subprocess.TimeoutExpired:
            _terminate_process_group(proc.pid, proc)
            if stderr_thread is not None:
                stderr_thread.join(timeout=0.5)
            raise ProcessExecutionError(f"Turn timed out after {timeout}s")

        if stderr_thread is not None:
            stderr_thread.join(timeout=2.0)
        elif proc.stderr is not None:
            try:
                rem_err = proc.stderr.read()
                if rem_err:
                    for err_line in rem_err.splitlines(keepends=True):
                        sink.emit_stderr_line(err_line, stderr_chunks)
            except Exception:
                pass

        rc = proc.returncode if proc.returncode is not None else wait_rc
        stderr_text = "".join(stderr_chunks)
        sink.write_log(f"\nSTDERR:\n{stderr_text}\nEXIT CODE: {rc}\n\n")

        return rc, tracker.get_clean_stdout("".join(stdout_chunks)), stderr_text
    except KeyboardInterrupt:
        _terminate_process_group(proc.pid, proc)
        raise
    finally:
        for pipe in (proc.stdout, proc.stderr):
            if pipe is not None:
                try:
                    pipe.close()
                except Exception:
                    pass
        if log_handle is not None:
            try:
                log_handle.close()
            except Exception:
                pass


def _extract_stream_kwargs(
    stream_config: Optional[TurnStreamConfig] = None,
    stream: bool = False,
    logger: Optional[DualLogger] = None,
    heartbeat_interval: Optional[float] = None,
) -> Dict[str, Any]:
    """Extracts active stream configuration kwargs for run_agy_turn and recovery dispatchers."""
    if stream_config is not None:
        return {"stream_config": stream_config}
    kwargs: Dict[str, Any] = {}
    if stream:
        kwargs["stream"] = True
    if logger is not None:
        kwargs["logger"] = logger
    if heartbeat_interval is not None:
        kwargs["heartbeat_interval"] = heartbeat_interval
    return kwargs


def _resolve_stream_config(
    stream_config: Optional[TurnStreamConfig] = None,
    stream: bool = False,
    logger: Optional[DualLogger] = None,
    heartbeat_interval: float = DEFAULT_HEARTBEAT_INTERVAL,
) -> TurnStreamConfig:
    """Resolves explicit TurnStreamConfig or legacy stream/logger/heartbeat arguments."""
    if stream_config is not None:
        return stream_config
    return TurnStreamConfig(
        stream=stream,
        logger=logger,
        heartbeat_interval=heartbeat_interval,
    )


def _build_turn_kwargs(
    prompt: str,
    mode: str,
    model: str,
    timeout: float,
    cwd: Path,
    log_file: Path,
    stream: bool = False,
    logger: Optional[DualLogger] = None,
    heartbeat_interval: Optional[float] = None,
    stream_config: Optional[TurnStreamConfig] = None,
) -> Dict[str, Any]:
    """Builds kwargs for run_agy_turn, forwarding stream configuration only when active."""
    kwargs: Dict[str, Any] = {
        "prompt": prompt,
        "mode": mode,
        "model": model,
        "timeout": timeout,
        "cwd": cwd,
        "log_file": log_file,
    }
    kwargs.update(
        _extract_stream_kwargs(
            stream_config=stream_config,
            stream=stream,
            logger=logger,
            heartbeat_interval=heartbeat_interval,
        )
    )
    return kwargs


def run_agy_turn(
    prompt: str,
    mode: str = "plan",
    model: str = DEFAULT_PLAN_MODEL,
    timeout: float = 900.0,
    cwd: Optional[Path] = None,
    log_file: Optional[Path] = None,
    stream: bool = False,
    logger: Optional[DualLogger] = None,
    heartbeat_interval: float = DEFAULT_HEARTBEAT_INTERVAL,
    output_format: Optional[str] = None,
    stream_config: Optional[TurnStreamConfig] = None,
) -> Tuple[int, str, str]:
    """Runs agy subprocess turn in a dedicated process group with --print prompt delivery."""
    resolved_cfg = _resolve_stream_config(
        stream_config=stream_config,
        stream=stream,
        logger=logger,
        heartbeat_interval=heartbeat_interval,
    )
    effective_output_format = (
        output_format
        if output_format is not None
        else ("stream-json" if resolved_cfg.stream else None)
    )
    print_timeout_arg = (
        f"{int(math.ceil(timeout))}s" if timeout and timeout > 0 else None
    )
    cmd = build_agy_command(
        mode=mode,
        model=model,
        prompt=prompt,
        output_format=effective_output_format,
        print_timeout=print_timeout_arg,
    )
    work_dir = cwd or PROJECT_ROOT
    effective_log_file = (
        Path(log_file)
        if log_file is not None
        else (
            resolved_cfg.logger.log_file
            if resolved_cfg.logger is not None and resolved_cfg.logger.log_file is not None
            else None
        )
    )

    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=work_dir,
        start_new_session=True,
    )

    if resolved_cfg.stream:
        if resolved_cfg.logger is not None and effective_log_file is not None:
            resolved_cfg.logger.log_status(
                f"Turn started (pid={proc.pid}, log={effective_log_file})"
            )
        return _stream_agy_process(
            proc=proc,
            prompt=prompt,
            mode=mode,
            model=model,
            timeout=timeout,
            effective_log_file=effective_log_file,
            logger=resolved_cfg.logger,
            heartbeat_interval=resolved_cfg.heartbeat_interval,
        )

    try:
        stdout, stderr = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        _terminate_process_group(proc.pid, proc)
        raise ProcessExecutionError(f"Turn timed out after {timeout}s")
    except KeyboardInterrupt:
        _terminate_process_group(proc.pid, proc)
        raise

    if effective_log_file:
        log_handle = _open_turn_log(effective_log_file)
        if log_handle is not None:
            try:
                log_handle.write(f"=== AGY TURN [{mode}] [{model}] ===\n")
                log_handle.write(f"PROMPT:\n{prompt}\n")
                log_handle.write(f"STDOUT:\n{stdout}\n")
                log_handle.write(f"STDERR:\n{stderr}\n")
                log_handle.write(f"EXIT CODE: {proc.returncode}\n\n")
            finally:
                log_handle.close()

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


def _normalize_repo_path(filepath: str) -> str:
    """Normalizes a git status/diff path, resolving renames and forward slashes."""
    clean_p = filepath.strip()
    if " -> " in clean_p:
        clean_p = clean_p.split(" -> ")[-1].strip()
    return clean_p.replace("\\", "/")


def _is_metadata_path(clean_p: str) -> bool:
    """Returns True if path belongs to conductor or agent metadata directories."""
    return clean_p.startswith(("conductor/", ".conductor/", ".gemini/", ".claude/", ".agents/"))


def _is_test_file(clean_p: str) -> bool:
    """Returns True if normalized path represents a test directory or test file."""
    dir_parts = set(clean_p.split("/")[:-1])
    if dir_parts & {"__tests__", "tests", "test", "e2e"}:
        return True
    test_suffixes = (".test.ts", ".test.tsx", ".test.js", ".test.jsx", ".spec.ts", ".spec.tsx")
    if clean_p.endswith(test_suffixes):
        return True
    basename = Path(clean_p).name
    return basename.startswith("test_") and clean_p.endswith(".py")


def _matches_code_or_manifest(clean_p: str, include_test_dirs: bool) -> bool:
    """Returns True if normalized path targets code directories, manifests, or code extensions."""
    prod_prefixes = (
        "app/", "lib/", "components/", "supabase/", "hooks/",
        "types/", "public/", "scripts/", "src/",
    )
    if include_test_dirs:
        prod_prefixes = prod_prefixes + ("pages/", "e2e/", "test/", "tests/", "styles/")
    if clean_p.startswith(prod_prefixes):
        return True
    if clean_p in ("package.json", "package-lock.json", "tsconfig.json"):
        return True
    prod_extensions = (".ts", ".tsx", ".js", ".jsx", ".py", ".sql", ".css")
    if include_test_dirs:
        prod_extensions = prod_extensions + (".html",)
    return any(clean_p.endswith(ext) for ext in prod_extensions)


def _is_production_file(filepath: str) -> bool:
    """Returns True if file modification violates planning turn purity."""
    clean_p = _normalize_repo_path(filepath)
    if _is_metadata_path(clean_p):
        return False
    return _matches_code_or_manifest(clean_p, include_test_dirs=True)


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
        file_part = line[3:].strip() if len(line) > 3 and line[2] == " " else line[2:].strip()
        if " -> " in file_part:
            file_part = file_part.split(" -> ")[-1].strip()
        if file_part:
            dirty_files.append(file_part)

    return len(dirty_files) == 0, dirty_files


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

    _, dirty_files = check_working_tree_cleanliness(cwd=cwd)
    violations = [f for f in dirty_files if _is_production_file(f)]

    if violations:
        raise PlanInvariantError(
            f"Post-plan invariant violation: modified application code detected ({', '.join(violations)}) during planning turn."
        )


def _is_red_task_production_violation(filepath: str) -> bool:
    """Returns True if a modified file in Red phase belongs to production application code (violating test purity)."""
    clean_p = _normalize_repo_path(filepath)
    if _is_metadata_path(clean_p) or _is_test_file(clean_p):
        return False
    return _matches_code_or_manifest(clean_p, include_test_dirs=False)


def dispatch_recovery_turn(
    track_name: str,
    phase_num: int,
    task_num: int,
    exec_model: str = DEFAULT_EXEC_MODEL,
    timeout: float = 900.0,
    cwd: Optional[Path] = None,
    stream: bool = False,
    logger: Optional[DualLogger] = None,
    heartbeat_interval: Optional[float] = None,
    stream_config: Optional[TurnStreamConfig] = None,
) -> bool:
    """Dispatches a single recovery turn via generate-prompt.py --recovery to clean up uncommitted work."""
    work_dir = cwd or PROJECT_ROOT
    track_dir = resolve_track_dir(track_name, cwd=work_dir) or (work_dir / "conductor" / "tracks" / track_name).resolve()
    log_file = track_dir / "logs" / f"phase-{phase_num}-task-{task_num}-recovery.log"

    prompt = generate_turn_prompt(
        track=track_name,
        phase_num=phase_num,
        task_num=task_num,
        mode="recovery",
        cwd=work_dir,
    )
    ret, _stdout, stderr = run_agy_turn(
        **_build_turn_kwargs(
            prompt=prompt,
            mode="auto",
            model=exec_model,
            timeout=timeout,
            cwd=work_dir,
            log_file=log_file,
            stream=stream,
            logger=logger,
            heartbeat_interval=heartbeat_interval,
            stream_config=stream_config,
        )
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


def _split_command_segments(cmd_input: Union[str, List[str]]) -> List[List[str]]:
    """Splits a shell command string (supporting '&&' chains and quoted args) into argv lists."""
    if isinstance(cmd_input, list):
        return [cmd_input]
    segments = [seg.strip() for seg in cmd_input.split("&&") if seg.strip()]
    return [shlex.split(seg) for seg in segments] if segments else [shlex.split(cmd_input)]


def verify_red_task(
    test_cmd: Union[str, List[str]],
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
    segments = _split_command_segments(test_cmd)
    res = None
    for cmd in segments:
        res = subprocess.run(cmd, capture_output=True, text=True, cwd=work_dir)
        if res.returncode != 0:
            break

    if res is None or res.returncode == 0:
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
    test_cmd: Union[str, List[str]],
    cwd: Optional[Path] = None,
    type_check_cmd: Optional[str] = "npm run type-check",
) -> bool:
    """Performs verification for Green tasks:
    1. Test command(s) exit 0.
    2. Type-check command exits 0 (when configured).
    Raises SupervisorInvariantError if either fails.
    """
    work_dir = cwd or PROJECT_ROOT
    for cmd in _split_command_segments(test_cmd):
        res = subprocess.run(cmd, capture_output=True, text=True, cwd=work_dir)
        if res.returncode != 0:
            raise SupervisorInvariantError(
                f"Green task test command failed (exit code {res.returncode}): {res.stderr or res.stdout}"
            )

    if type_check_cmd:
        for tc_cmd in _split_command_segments(type_check_cmd):
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
        if not diff_files:
            raise SupervisorInvariantError(
                "Exempt docs task produced no modified markdown files."
            )
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
    base_sha: Optional[str] = None,
) -> bool:
    """Audits git commit message, git notes metadata, plan.md task mark, and plan commit.
    Raises SupervisorInvariantError on violation.
    """
    work_dir = cwd or PROJECT_ROOT

    if base_sha and re.fullmatch(r"[a-f0-9]{7,40}", base_sha, re.IGNORECASE):
        short_commit = commit_sha[:7].lower()
        if base_sha.lower().startswith(short_commit) or commit_sha.lower().startswith(base_sha[:7].lower()):
            raise SupervisorInvariantError(
                f"Task commit SHA {commit_sha[:7]} matches baseline {base_sha[:7]}; no new task commit was created."
            )

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
    if task.status != "complete":
        raise SupervisorInvariantError(
            f"plan.md task '{task.description}' is not marked [x] (status: {task.status})"
        )
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


def _is_red_task(task_desc: str) -> bool:
    """Returns True if task description indicates a TDD Red phase task."""
    desc_lower = task_desc.lower().strip()
    return (
        desc_lower.startswith("write failing")
        or "red phase" in desc_lower
        or "(red)" in desc_lower
        or "failing unit test" in desc_lower
        or "failing test" in desc_lower
        or "failing integration" in desc_lower
        or desc_lower.startswith("test(")
    )


_GENERATE_PROMPT_MOD: Optional[Any] = None


def _load_generate_prompt_module(work_dir: Path) -> Optional[Any]:
    """Lazily loads scripts/agent/generate-prompt.py for verification command inference."""
    global _GENERATE_PROMPT_MOD
    if _GENERATE_PROMPT_MOD is not None:
        return _GENERATE_PROMPT_MOD

    candidates = [
        work_dir / "scripts" / "agent" / "generate-prompt.py",
        PROJECT_ROOT / "scripts" / "agent" / "generate-prompt.py",
    ]
    for gp_path in candidates:
        if gp_path.exists():
            spec = importlib.util.spec_from_file_location("conductor_generate_prompt", gp_path)
            if spec and spec.loader:
                mod = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(mod)
                _GENERATE_PROMPT_MOD = mod
                return mod
    return None


def _resolve_target_verification_commands(
    track_dir: Path,
    phase_num: int,
    task: TaskInfo,
    work_dir: Path,
) -> Tuple[List[str], bool]:
    """Resolves targeted test commands and whether the task is Python-only."""
    is_red = _is_red_task(task.description)
    gp = _load_generate_prompt_module(work_dir)
    test_cmds: List[str] = []
    is_py_only = False

    if gp is not None:
        strategy = gp.infer_verification_strategy(
            str(track_dir),
            phase_num,
            task.task_num,
            task.description,
            task.subtasks,
            mode="red" if is_red else "green",
            exempt=task.exempt,
        )
        raw_cmds = strategy.get("commands", [])
        for raw_c in raw_cmds:
            filtered = gp.filter_idempotent_verification_cmd(raw_c)
            if filtered and "type-check" not in filtered:
                test_cmds.append(filtered)

        plan_file = track_dir / f"phase-{phase_num}-task-{task.task_num}-plan.md"
        if plan_file.exists():
            targets, _ = gp._extract_plan_targets_and_cmds(plan_file)
            if targets and all(t.endswith((".py", ".toml")) for t in targets):
                is_py_only = True

    if not is_py_only and test_cmds:
        is_py_only = all(
            any(tok in c for tok in ("python", "pytest", "unittest"))
            and not any(tok in c for tok in (".ts", ".tsx", ".js", ".jsx", "jest", "playwright", "deno"))
            for c in test_cmds
        )

    if not test_cmds:
        test_cmds = ["./scripts/containers/run-jest-container.sh"]

    return test_cmds, is_py_only


def verify_task_execution(
    track_name: str,
    phase_num: int,
    task_num: int,
    base_sha: Optional[str] = None,
    cwd: Optional[Path] = None,
) -> bool:
    """High-level supervisor router: resolves task metadata and dispatches red, green, or exempt verification."""
    work_dir = cwd or PROJECT_ROOT
    track_dir = resolve_track_dir(track_name, cwd=work_dir) or (work_dir / "conductor" / "tracks" / track_name).resolve()
    phases = parse_track_plan(track_dir)
    phase = phases.get(phase_num)
    task = next((t for t in phase.tasks if t.task_num == task_num), None) if phase else None
    if task is None:
        raise SupervisorInvariantError(
            f"Task {task_num} in Phase {phase_num} not found in {track_dir / 'plan.md'}"
        )

    if task.exempt:
        return verify_exempt_task(task.exempt, base_sha=base_sha, cwd=work_dir)

    test_cmds, is_py_only = _resolve_target_verification_commands(
        track_dir=track_dir,
        phase_num=phase_num,
        task=task,
        work_dir=work_dir,
    )

    if _is_red_task(task.description):
        return verify_red_task(
            test_cmd=test_cmds[0],
            base_sha=base_sha or "HEAD~1",
            cwd=work_dir,
        )

    return verify_green_task(
        test_cmd=" && ".join(test_cmds),
        cwd=work_dir,
        type_check_cmd=None if is_py_only else "npm run type-check",
    )


# ---------------------------------------------------------------------------
# Tier 1 Planning Turn Dispatcher
# ---------------------------------------------------------------------------

def dispatch_tier1_planning(
    track_name: str,
    phase_num: int,
    task_num: int,
    plan_model: str = DEFAULT_PLAN_MODEL,
    force_plan: bool = False,
    timeout: float = 900.0,
    cwd: Optional[Path] = None,
    stream: bool = False,
    logger: Optional[DualLogger] = None,
    heartbeat_interval: Optional[float] = None,
    stream_config: Optional[TurnStreamConfig] = None,
) -> bool:
    """Coordinates Tier 1 turn: cache check -> prompt gen -> agy dispatch -> invariant audit."""
    work_dir = cwd or PROJECT_ROOT
    track_dir = resolve_track_dir(track_name, cwd=work_dir)
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
        **_build_turn_kwargs(
            prompt=prompt,
            mode="plan",
            model=plan_model,
            timeout=timeout,
            cwd=work_dir,
            log_file=log_file,
            stream=stream,
            logger=logger,
            heartbeat_interval=heartbeat_interval,
            stream_config=stream_config,
        )
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
    exec_model: str = DEFAULT_EXEC_MODEL,
    auto_recover: bool = False,
    timeout: float = 900.0,
    cwd: Optional[Path] = None,
    stream: bool = False,
    logger: Optional[DualLogger] = None,
    skip_plan: bool = False,
    heartbeat_interval: Optional[float] = None,
    stream_config: Optional[TurnStreamConfig] = None,
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
    track_dir = resolve_track_dir(track_name, cwd=work_dir) or (work_dir / "conductor" / "tracks" / track_name).resolve()
    log_file = track_dir / "logs" / f"phase-{phase_num}-task-{task_num}-exec.log"

    head_res = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        cwd=work_dir,
    )
    base_sha = head_res.stdout.strip() if head_res.returncode == 0 else "HEAD~1"

    if skip_plan:
        prompt = generate_turn_prompt(
            track=track_name,
            phase_num=phase_num,
            task_num=task_num,
            mode="exec",
            cwd=work_dir,
            skip_plan=True,
        )
    else:
        prompt = generate_turn_prompt(
            track=track_name,
            phase_num=phase_num,
            task_num=task_num,
            mode="exec",
            cwd=work_dir,
        )

    ret, _stdout, stderr = run_agy_turn(
        **_build_turn_kwargs(
            prompt=prompt,
            mode="auto",
            model=exec_model,
            timeout=timeout,
            cwd=work_dir,
            log_file=log_file,
            stream=stream,
            logger=logger,
            heartbeat_interval=heartbeat_interval,
            stream_config=stream_config,
        )
    )
    if ret != 0:
        raise ProcessExecutionError(
            f"Tier 2 execution turn failed with exit code {ret}: {stderr.strip()}"
        )

    is_clean, dirty_files = check_working_tree_cleanliness(cwd=work_dir)
    if not is_clean:
        if auto_recover:
            recovery_kwargs: Dict[str, Any] = {
                "track_name": track_name,
                "phase_num": phase_num,
                "task_num": task_num,
                "exec_model": exec_model,
                "timeout": timeout,
                "cwd": work_dir,
            }
            recovery_kwargs.update(
                _extract_stream_kwargs(
                    stream_config=stream_config,
                    stream=stream,
                    logger=logger,
                    heartbeat_interval=heartbeat_interval,
                )
            )
            dispatch_recovery_turn(**recovery_kwargs)
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
    if task is not None:
        if task.status != "complete" or not task.commit_sha:
            raise SupervisorInvariantError(
                f"Task {task_num} in {plan_path} was not marked [x] with [commit: <sha>]."
            )
        commit_sha = task.commit_sha
    else:
        task = TaskInfo(
            task_num=task_num,
            description=f"Phase {phase_num} Task {task_num}",
            status="complete",
            status_char="x",
            is_checkpoint=False,
        )
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
        base_sha=base_sha,
    )
    return True


# ---------------------------------------------------------------------------
# Gate 1: Phase Checkpoint Execution & Audit
# ---------------------------------------------------------------------------

def verify_checkpoint_commit_and_notes(
    phase_num: int,
    plan_path: Path,
    cwd: Optional[Path] = None,
    base_sha: Optional[str] = None,
) -> str:
    """Verifies [checkpoint: <sha>], checkpoint commit message, git notes, and conductor(plan) commit."""
    work_dir = cwd or PROJECT_ROOT
    if not plan_path.exists():
        raise SupervisorInvariantError(f"plan.md not found at {plan_path}")

    phases = parse_track_plan(plan_path)
    phase = phases.get(phase_num)
    if phase is None or not phase.checkpoint_sha:
        raise SupervisorInvariantError(
            f"Phase {phase_num} missing [checkpoint: <sha>] tag in {plan_path}"
        )

    cp_sha = phase.checkpoint_sha
    if base_sha and re.fullmatch(r"[a-f0-9]{7,40}", base_sha, re.IGNORECASE):
        short_cp = cp_sha[:7].lower()
        if base_sha.lower().startswith(short_cp) or cp_sha.lower().startswith(base_sha[:7].lower()):
            raise SupervisorInvariantError(
                f"Checkpoint SHA {short_cp} matches baseline {base_sha[:7]}; no new checkpoint commit was created."
            )

    log_res = subprocess.run(
        ["git", "log", "-1", "--format=%B", cp_sha],
        capture_output=True,
        text=True,
        cwd=work_dir,
    )
    if log_res.returncode != 0:
        raise SupervisorInvariantError(
            f"Failed to inspect checkpoint commit {cp_sha}: {log_res.stderr}"
        )
    lines = [line.strip() for line in log_res.stdout.splitlines() if line.strip()]
    first_line = lines[0] if lines else ""
    expected_prefix = f"conductor(checkpoint): Checkpoint end of Phase {phase_num}"
    if not first_line.startswith(expected_prefix):
        raise SupervisorInvariantError(
            f"Checkpoint commit {cp_sha} message '{first_line}' does not start with '{expected_prefix}'"
        )

    notes_res = subprocess.run(
        ["git", "notes", "show", cp_sha],
        capture_output=True,
        text=True,
        cwd=work_dir,
    )
    if notes_res.returncode != 0 or not notes_res.stdout.strip():
        raise SupervisorInvariantError(
            f"Git notes missing or empty on checkpoint commit {cp_sha}"
        )

    plan_log_res = subprocess.run(
        ["git", "log", "-1", "--pretty=%B", "--", str(plan_path)],
        capture_output=True,
        text=True,
        cwd=work_dir,
    )
    if plan_log_res.returncode != 0 or "conductor(plan)" not in plan_log_res.stdout:
        raise SupervisorInvariantError(
            f"Missing conductor(plan) commit updating {plan_path} with checkpoint SHA {cp_sha}"
        )

    return cp_sha


def dispatch_gate1_checkpoint(
    track_name: str,
    phase_num: int,
    checkpoint_model: Optional[str] = None,
    timeout: float = 900.0,
    cwd: Optional[Path] = None,
    stream: bool = False,
    logger: Optional[DualLogger] = None,
    heartbeat_interval: Optional[float] = None,
    stream_config: Optional[TurnStreamConfig] = None,
) -> str:
    """Executes unattended Gate 1 phase verification checkpoint and audits commit/notes invariants."""
    work_dir = cwd or PROJECT_ROOT
    track_dir = resolve_track_dir(track_name, cwd=work_dir) or (work_dir / "conductor" / "tracks" / track_name).resolve()
    model = checkpoint_model or DEFAULT_CHECKPOINT_MODEL
    log_file = track_dir / "logs" / f"phase-{phase_num}-checkpoint.log"

    head_res = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        cwd=work_dir,
    )
    base_sha = head_res.stdout.strip() if head_res.returncode == 0 else None

    prompt = generate_turn_prompt(
        track=track_name,
        phase_num=phase_num,
        task_num=None,
        mode="checkpoint",
        unattended=True,
        cwd=work_dir,
    )

    ret, _stdout, stderr = run_agy_turn(
        **_build_turn_kwargs(
            prompt=prompt,
            mode="auto",
            model=model,
            timeout=timeout,
            cwd=work_dir,
            log_file=log_file,
            stream=stream,
            logger=logger,
            heartbeat_interval=heartbeat_interval,
            stream_config=stream_config,
        )
    )
    if ret != 0:
        raise ProcessExecutionError(
            f"Gate 1 checkpoint turn failed with exit code {ret}: {stderr.strip()}"
        )

    is_clean, dirty_files = check_working_tree_cleanliness(cwd=work_dir)
    if not is_clean:
        raise GitTreeDirtyError(
            f"Working tree contains uncommitted changes after Gate 1 checkpoint: {', '.join(dirty_files)}"
        )

    return verify_checkpoint_commit_and_notes(
        phase_num=phase_num,
        plan_path=track_dir / "plan.md",
        cwd=work_dir,
        base_sha=base_sha,
    )


# ---------------------------------------------------------------------------
# Gate 2: Brain Snapshotting & Unattended Phase Review
# ---------------------------------------------------------------------------

def snapshot_brain_dirs(
    brain_dir: Optional[Path] = None,
) -> Set[str]:
    """Returns set of existing conversation directory names inside brain_dir."""
    target = Path(brain_dir) if brain_dir is not None else DEFAULT_BRAIN_DIR
    if not target.exists() or not target.is_dir():
        return set()
    return {p.name for p in target.iterdir() if p.is_dir()}


def capture_conversation_id(
    before_dirs: Set[str],
    brain_dir: Optional[Path] = None,
    min_mtime: Optional[float] = None,
) -> Optional[str]:
    """Identifies the conversation ID created during a turn via new dir diff or transcript.jsonl fallback."""
    target = Path(brain_dir) if brain_dir is not None else DEFAULT_BRAIN_DIR
    if not target.exists() or not target.is_dir():
        return None

    new_dirs = snapshot_brain_dirs(target) - before_dirs
    if new_dirs:
        candidates = [target / d for d in new_dirs if (target / d).is_dir()]
        if min_mtime is not None:
            filtered = [c for c in candidates if c.stat().st_mtime >= min_mtime]
            if filtered:
                candidates = filtered
        if candidates:
            newest = max(candidates, key=lambda p: p.stat().st_mtime)
            return newest.name

    transcript_candidates: List[Tuple[float, str]] = []
    for entry in target.iterdir():
        if not entry.is_dir():
            continue
        for rel in (
            entry / ".system_generated" / "logs" / "transcript.jsonl",
            entry / "transcript.jsonl",
        ):
            if rel.exists() and rel.is_file():
                mtime = rel.stat().st_mtime
                if min_mtime is None or mtime >= min_mtime:
                    transcript_candidates.append((mtime, entry.name))

    if transcript_candidates:
        transcript_candidates.sort(key=lambda item: item[0], reverse=True)
        return transcript_candidates[0][1]

    return None


def build_review_prompt(
    track_name: str,
    phase_num: int,
    report_path: Path,
) -> str:
    """Builds unattended /conductor:review prompt scoped to a specific track phase."""
    return (
        f"/conductor:review {track_name}\n\n"
        f"UNATTENDED / NON-INTERACTIVE REVIEW OVERRIDES:\n"
        f"- Scope strictly to track `{track_name}`, Phase {phase_num}. Auto-confirm scope without any `ask_question` modal pauses.\n"
        f"- If the phase diff exceeds 300 lines, automatically accept Iterative Review Mode without pausing for confirmation.\n"
        f"- Write the full structured markdown review report to `{report_path}`.\n"
        f"- Preserve canonical finding severity headings (`### [Critical]`, `### [High]`, `### [Medium]`, `### [Low]`).\n"
        f"- Halt cleanly after saving `{report_path}`. Do NOT auto-apply fixes and do NOT prompt interactively at Section 3.1.\n"
    )


def parse_review_severity(
    report_text: str,
) -> Tuple[bool, List[str]]:
    """Matches strict H3 Critical/High headings using REVIEW_SEVERITY_PATTERN."""
    pattern = re.compile(REVIEW_SEVERITY_PATTERN, re.IGNORECASE)
    findings = [
        line.strip()
        for line in report_text.splitlines()
        if pattern.match(line.strip())
    ]
    return len(findings) > 0, findings


def format_resume_command(
    conv_id: Optional[str],
    phase_num: int,
) -> str:
    """Formats the exact agy --conversation resumption command for Critical/High review findings."""
    cid = conv_id or "<conversation-id>"
    return f'agy --conversation {cid} "Apply the review suggestions from phase-{phase_num}-review.md"'


def dispatch_gate2_review(
    track_name: str,
    phase_num: int,
    review_model: Optional[str] = None,
    timeout: float = 900.0,
    cwd: Optional[Path] = None,
    brain_dir: Optional[Path] = None,
    stream: bool = False,
    logger: Optional[DualLogger] = None,
    heartbeat_interval: Optional[float] = None,
    stream_config: Optional[TurnStreamConfig] = None,
) -> ReviewResult:
    """Dispatches Gate 2 unattended review, captures conversation ID, and parses severity findings."""
    work_dir = cwd or PROJECT_ROOT
    track_dir = resolve_track_dir(track_name, cwd=work_dir) or (work_dir / "conductor" / "tracks" / track_name).resolve()
    model = review_model or DEFAULT_REVIEW_MODEL
    log_file = track_dir / "logs" / f"phase-{phase_num}-review.log"
    report_path = track_dir / f"phase-{phase_num}-review.md"

    prior_mtime_ns = report_path.stat().st_mtime_ns if report_path.exists() else None
    before_dirs = snapshot_brain_dirs(brain_dir=brain_dir)
    start_ts = time.time()
    prompt = build_review_prompt(track_name=track_name, phase_num=phase_num, report_path=report_path)

    ret, stdout, stderr = run_agy_turn(
        **_build_turn_kwargs(
            prompt=prompt,
            mode="auto",
            model=model,
            timeout=timeout,
            cwd=work_dir,
            log_file=log_file,
            stream=stream,
            logger=logger,
            heartbeat_interval=heartbeat_interval,
            stream_config=stream_config,
        )
    )
    conv_id = capture_conversation_id(before_dirs, brain_dir=brain_dir, min_mtime=start_ts - 2.0)

    if ret != 0:
        raise ProcessExecutionError(
            f"Gate 2 review turn failed with exit code {ret}: {stderr.strip()}"
        )

    report_fresh = (
        report_path.exists()
        and report_path.stat().st_size > 0
        and (prior_mtime_ns is None or report_path.stat().st_mtime_ns != prior_mtime_ns)
    )
    if report_fresh:
        report_text = report_path.read_text(encoding="utf-8")
    elif stdout and stdout.strip():
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(stdout, encoding="utf-8")
        report_text = stdout
    else:
        raise ProcessExecutionError(
            f"Gate 2 review produced no report at {report_path} and empty stdout."
        )

    has_crit_high, findings = parse_review_severity(report_text)
    return ReviewResult(
        report_path=report_path,
        conversation_id=conv_id,
        has_critical_or_high=has_crit_high,
        findings=findings,
        exit_code=2 if has_crit_high else 0,
    )


# ---------------------------------------------------------------------------
# CLI Argument Parser & Entrypoint
# ---------------------------------------------------------------------------

def resolve_model_config(
    args: Optional[argparse.Namespace] = None,
    env: Optional[Mapping[str, str]] = None,
) -> Dict[str, str]:
    """Resolves model configuration with 3-tier precedence:
    1. Explicit per-role CLI flags (--plan-model, --exec-model, --checkpoint-model, --review-model)
    2. Per-role environment variables (CONDUCTOR_PLAN_MODEL, CONDUCTOR_EXEC_MODEL, etc.)
    3. Composed <family>-<effort> fallback (--model-family > CONDUCTOR_MODEL_FAMILY > DEFAULT_MODEL_FAMILY)
    """
    env_map = os.environ if env is None else env
    family = (
        (getattr(args, "model_family", None) if args is not None else None)
        or env_map.get("CONDUCTOR_MODEL_FAMILY")
        or DEFAULT_MODEL_FAMILY
    )
    config: Dict[str, str] = {"family": family}
    for role, effort in ROLE_EFFORT_MAP.items():
        cli_val = getattr(args, f"{role}_model", None) if args is not None else None
        env_val = env_map.get(f"CONDUCTOR_{role.upper()}_MODEL")
        config[role] = cli_val or env_val or f"{family}-{effort}"
    return config


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
        "--skip-plan",
        action="store_true",
        default=False,
        help="Skip Tier 1 planning turn and execute directly from plan.md task description and subtasks.",
    )
    parser.add_argument(
        "--timeout",
        default="15m",
        help="Turn timeout duration (e.g. 15m, 900s, 900; default: 15m).",
    )
    parser.add_argument(
        "--heartbeat",
        default="30s",
        help="Heartbeat interval during silent agy turns (e.g. 30s, 1m, 0 to disable; default: 30s).",
    )
    parser.add_argument(
        "--model-family",
        default=None,
        help=f"Base model family for effort composition (default: {DEFAULT_MODEL_FAMILY}).",
    )
    parser.add_argument(
        "--plan-model",
        default=None,
        help=f"Model to use for Tier 1 planning (default: {DEFAULT_PLAN_MODEL}).",
    )
    parser.add_argument(
        "--exec-model",
        default=None,
        help=f"Model to use for Tier 2 execution (default: {DEFAULT_EXEC_MODEL}).",
    )
    parser.add_argument(
        "--checkpoint-model",
        default=None,
        help=f"Model to use for Gate 1 checkpoint (default: {DEFAULT_CHECKPOINT_MODEL}).",
    )
    parser.add_argument(
        "--review-model",
        default=None,
        help=f"Model to use for Gate 2 review (default: {DEFAULT_REVIEW_MODEL}).",
    )
    parser.add_argument(
        "--no-review",
        action="store_true",
        default=False,
        help="Skip Gate 2 review step at phase boundary.",
    )
    parser.add_argument(
        "--force-review",
        action="store_true",
        default=False,
        help="Force Gate 2 review even on documentation-only phases.",
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
    models = resolve_model_config(args)

    try:
        timeout_sec = parse_timeout(args.timeout)
        if timeout_sec <= 0:
            raise ValueError("timeout must be positive")
    except ValueError as err:
        print(f"Error: Invalid --timeout value '{args.timeout}': {err}", file=sys.stderr)
        return 1

    try:
        heartbeat_sec = parse_timeout(getattr(args, "heartbeat", "30s"))
        if heartbeat_sec < 0:
            raise ValueError("heartbeat must be non-negative")
    except ValueError as err:
        print(f"Error: Invalid --heartbeat value '{args.heartbeat}': {err}", file=sys.stderr)
        return 1

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
    if args.task is not None:
        pending_tasks = [t for t in pending_tasks if t.task_num == args.task]

    if not pending_tasks:
        print(f"No pending tasks in phase {active_phase.phase_num}.")
        return 0

    runner_log = None if args.dry_run else (track_dir / "logs" / "conductor-auto.log")
    logger = DualLogger(log_file=runner_log)
    stream_cfg = TurnStreamConfig(
        stream=True,
        logger=logger,
        heartbeat_interval=heartbeat_sec,
    )
    logger.log_banner(
        f"Conductor Auto: {track_name} (Phase {active_phase.phase_num})",
        (
            f"Family: {models['family']} | plan={models['plan']} | exec={models['exec']} "
            f"| checkpoint={models['checkpoint']} | review={models['review']}"
        ),
    )

    for task in pending_tasks:
        if task.is_checkpoint:
            logger.log_status(
                f"Phase {active_phase.phase_num} reached checkpoint task {task.task_num}. Stopping task execution loop."
            )
            break

        skip_t1 = should_skip_tier1_plan(
            task, force_plan=args.force_plan, skip_plan=args.skip_plan
        )

        if args.dry_run:
            if skip_t1:
                logger.log_status(
                    f"[DRY-RUN] Would skip Tier 1 planning for Phase {active_phase.phase_num} Task {task.task_num} (exempt: docs / --skip-plan): {task.description}"
                )
            else:
                logger.log_status(
                    f"[DRY-RUN] Would dispatch Tier 1 planning for Phase {active_phase.phase_num} Task {task.task_num} with model {models['plan']}: {task.description}"
                )
            logger.log_status(f"[DRY-RUN] Would dispatch Tier 2 execution with model {models['exec']}")
            continue

        try:
            if skip_t1:
                logger.log_status(
                    f"Skipping Tier 1 planning for Phase {active_phase.phase_num} Task {task.task_num} (direct execution fast-path)."
                )
            else:
                logger.log_status(
                    f"Dispatching Tier 1 planning for Phase {active_phase.phase_num} Task {task.task_num}: {task.description}"
                )
                dispatch_tier1_planning(
                    track_name=track_name,
                    phase_num=active_phase.phase_num,
                    task_num=task.task_num,
                    plan_model=models["plan"],
                    force_plan=args.force_plan,
                    timeout=timeout_sec,
                    stream_config=stream_cfg,
                )
            logger.log_status(
                f"Dispatching Tier 2 execution for Phase {active_phase.phase_num} Task {task.task_num}: {task.description}"
            )
            dispatch_tier2_execution(
                track_name=track_name,
                phase_num=active_phase.phase_num,
                task_num=task.task_num,
                exec_model=models["exec"],
                auto_recover=args.auto_recover,
                timeout=timeout_sec,
                skip_plan=skip_t1,
                stream_config=stream_cfg,
            )
        except ConductorAutoError as err:
            logger.log_error(f"Conductor Auto Error: {err}")
            return 1
        except Exception as err:
            logger.log_error(f"Unexpected error: {err}")
            return 1

    if args.task is not None:
        return 0

    skip_g2 = should_skip_gate2_review(
        active_phase, no_review=args.no_review, force_review=args.force_review
    )

    if args.dry_run:
        logger.log_status(f"[DRY-RUN] Would dispatch Gate 1 checkpoint with model {models['checkpoint']}")
        if not skip_g2:
            logger.log_status(f"[DRY-RUN] Would dispatch Gate 2 review with model {models['review']}")
        else:
            logger.log_status(
                f"[DRY-RUN] Would skip Gate 2 review for {_format_gate2_skip_reason(active_phase.phase_num, args.no_review)}"
            )
        return 0

    try:
        logger.log_banner(
            f"Gate 1: Phase {active_phase.phase_num} Checkpoint",
            f"Model: {models['checkpoint']}",
        )
        cp_sha = dispatch_gate1_checkpoint(
            track_name=track_name,
            phase_num=active_phase.phase_num,
            checkpoint_model=models["checkpoint"],
            timeout=timeout_sec,
            stream_config=stream_cfg,
        )
        logger.log_status(f"Gate 1 checkpoint verified (SHA: {cp_sha}).")
    except ConductorAutoError as err:
        logger.log_error(f"Gate 1 Checkpoint Error: {err}")
        return 1
    except Exception as err:
        logger.log_error(f"Unexpected Gate 1 error: {err}")
        return 1

    if skip_g2:
        logger.log_status(
            f"Skipping Gate 2 review for {_format_gate2_skip_reason(active_phase.phase_num, args.no_review)}. Halting at phase boundary."
        )
        return 0

    try:
        logger.log_banner(
            f"Gate 2: Phase {active_phase.phase_num} Review",
            f"Model: {models['review']}",
        )
        review_result = dispatch_gate2_review(
            track_name=track_name,
            phase_num=active_phase.phase_num,
            review_model=models["review"],
            timeout=timeout_sec,
            stream_config=stream_cfg,
        )
    except ConductorAutoError as err:
        logger.log_error(f"Gate 2 Review Error: {err}")
        return 1
    except Exception as err:
        logger.log_error(f"Unexpected Gate 2 error: {err}")
        return 1

    if review_result.has_critical_or_high or review_result.exit_code == 2:
        logger.log_banner(
            f"REVIEW BLOCKED: Critical/High findings in Phase {active_phase.phase_num}",
            f"Report: {review_result.report_path}",
        )
        for finding in review_result.findings:
            logger.log_error(f"Finding: {finding}")
        resume_cmd = format_resume_command(
            review_result.conversation_id, active_phase.phase_num
        )
        logger.log_error(f"To resume and apply review fixes, run: {resume_cmd}")
        return 2

    has_med_low = False
    if review_result.report_path.exists():
        report_content = review_result.report_path.read_text(encoding="utf-8")
        if re.search(r"^###\s+\[?(Medium|Low)\]?", report_content, re.MULTILINE | re.IGNORECASE):
            has_med_low = True

    if has_med_low:
        logger.log_status(
            f"Phase {active_phase.phase_num} review passed with non-blocking Medium/Low suggestions "
            f"(see {review_result.report_path})."
        )
    else:
        logger.log_status(
            f"Phase {active_phase.phase_num} review passed cleanly (see {review_result.report_path})."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
