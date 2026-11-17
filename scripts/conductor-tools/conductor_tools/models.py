"""Core domain models, enums, and exception hierarchy for `conductor_tools`."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import Any, Optional


class ConductorError(RuntimeError):
    """Base exception for all Conductor tooling failures."""


class PlanInvariantError(ConductorError):
    """Raised when a Conductor plan file or blueprint violates structural invariants."""


class ProcessExecutionError(ConductorError):
    """Raised when an external subprocess turn fails or times out."""


class SupervisorInvariantError(ConductorError):
    """Raised when post-turn supervisor verification gates fail."""


class GitTreeDirtyError(SupervisorInvariantError):
    """Raised when unexpected uncommitted changes remain in the git working tree."""


class PromptMode(StrEnum):
    """Supported execution and prompt generation modes."""

    PLAN = "plan"
    RED = "red"
    GREEN = "green"
    EXEMPT = "exempt"
    CHECKPOINT = "checkpoint"
    RECOVERY = "recovery"
    REVIEW = "review"


@dataclass(frozen=True, slots=True)
class TaskInfo:
    """Parsed metadata for a single task item in `plan.md`."""

    task_num: int
    description: str
    status: str
    status_char: str
    is_checkpoint: bool
    commit_sha: Optional[str] = None
    exempt: Optional[str] = None
    subtasks: tuple[str, ...] = ()
    raw_line: str = ""


@dataclass(frozen=True, slots=True)
class PhaseInfo:
    """Parsed metadata and task collection for a phase in `plan.md`."""

    phase_num: int
    name: str
    checkpoint_sha: Optional[str] = None
    raw_heading: str = ""
    tasks: tuple[TaskInfo, ...] = ()
    is_complete: bool = False
    review_fixes: tuple[TaskInfo, ...] = ()


@dataclass(frozen=True, slots=True)
class TrackPlan:
    """Complete parsed plan representation for a Conductor track."""

    track_name: str
    track_dir: Path
    plan_path: Path
    phases: dict[int, PhaseInfo] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class TaskBlueprint:
    """Extracted target files, verification commands, and post-exec metadata for a task."""

    plan_path: Path
    target_files: tuple[str, ...] = ()
    referenced_test_files: tuple[str, ...] = ()
    verification_commands: tuple[str, ...] = ()
    post_exec_section: Optional[str] = None
    post_exec_commit_msg: Optional[str] = None

    @property
    def is_empty(self) -> bool:
        """Return True when no target files, test references, or verification commands exist."""
        return not (
            self.target_files
            or self.referenced_test_files
            or self.verification_commands
        )


@dataclass(frozen=True, slots=True)
class PhaseCheckpointContext:
    """Pre-computed git diff scope, verification commands, and domain for a phase checkpoint."""

    baseline_sha: Optional[str]
    end_sha: str
    changed_files: tuple[str, ...] = ()
    sibling_plans: tuple[str, ...] = ()
    commands: tuple[str, ...] = ()
    domain: str = "backend_tooling"
    has_checkpoint_plan: bool = False
    clean_phase_name: str = ""
    raw_heading: str = ""


@dataclass(frozen=True, slots=True)
class VerificationStrategy:
    """Resolved execution mode, verification commands, and commit message for a task."""

    mode: PromptMode
    commands: tuple[str, ...] = ()
    instruction: str = ""
    commit_msg: str = ""
    is_red: bool = False
    is_checkpoint: bool = False
    exempt: Optional[str] = None
    checkpoint_context: Optional[PhaseCheckpointContext] = None
    is_python_only: bool = False


@dataclass(frozen=True, slots=True)
class TurnStreamConfig:
    """Streaming and heartbeat configuration for headless `agy` turns."""

    stream: bool = False
    logger: Optional[Any] = None
    heartbeat_interval: float = 30.0


@dataclass(frozen=True, slots=True)
class ReviewResult:
    """Outcome and findings parsed from a Gate 2 phase review report."""

    report_path: Path
    conversation_id: Optional[str] = None
    has_critical_or_high: bool = False
    findings: tuple[str, ...] = ()
    exit_code: int = 0


__all__ = [
    "ConductorError",
    "GitTreeDirtyError",
    "PhaseCheckpointContext",
    "PhaseInfo",
    "PlanInvariantError",
    "ProcessExecutionError",
    "PromptMode",
    "ReviewResult",
    "SupervisorInvariantError",
    "TaskBlueprint",
    "TaskInfo",
    "TrackPlan",
    "TurnStreamConfig",
    "VerificationStrategy",
]
