#!/usr/bin/env python3
"""
Shared Conductor plan.md Markdown Parser (plan_parser.py)

Provides dependency-free dataclasses, compiled regexes, and parsing functions
for extracting phases, tasks, subtasks, completion statuses, commit SHAs,
checkpoint tags, and [exempt: ...] markers from Conductor plan.md files.
"""

from dataclasses import dataclass, field
from pathlib import Path
import re
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Compiled Markdown Patterns
# ---------------------------------------------------------------------------

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
_CHECKPOINT_TASK_WORD_RE = re.compile(r"\bcheckpoint\s+task\b")

_STATUS_MAP: Dict[str, tuple[str, str]] = {
    "x": ("complete", "x"),
    "~": ("in_progress", "~"),
    "-": ("skipped", "-"),
    " ": ("pending", " "),
}


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

@dataclass
class TaskInfo:
    """Represents a parsed task or review-fix item from a Conductor plan.md file."""

    task_num: int
    description: str
    status: str              # "pending" | "in_progress" | "complete" | "skipped"
    status_char: str         # " " | "~" | "x" | "-"
    is_checkpoint: bool      # True if manual verification / checkpoint end of phase
    commit_sha: Optional[str] = None
    exempt: Optional[str] = None
    subtasks: List[str] = field(default_factory=list)
    raw_line: str = ""

    def to_dict(self) -> Dict[str, Any]:
        """Serializes TaskInfo to the dict schema expected by generate-prompt.py."""
        return {
            "status": self.status,
            "description": self.description,
            "subtasks": list(self.subtasks),
            "commit_sha": self.commit_sha,
            "is_checkpoint": self.is_checkpoint,
            "exempt": self.exempt,
            "raw_line": self.raw_line,
        }


@dataclass
class PhaseInfo:
    """Represents a parsed phase from a Conductor plan.md file."""

    phase_num: int
    name: str
    checkpoint_sha: Optional[str]
    raw_heading: str
    tasks: List[TaskInfo] = field(default_factory=list)
    is_complete: bool = False
    review_fixes: List[TaskInfo] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Serializes PhaseInfo to the dict schema expected by generate-prompt.py."""
        return {
            "name": self.name,
            "checkpoint_sha": self.checkpoint_sha,
            "raw_heading": self.raw_heading,
            "tasks": [t.to_dict() for t in self.tasks],
            "review_fixes": [t.to_dict() for t in self.review_fixes],
        }


# ---------------------------------------------------------------------------
# Classification & Parsing Helpers
# ---------------------------------------------------------------------------

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
        or bool(_CHECKPOINT_TASK_WORD_RE.search(desc_lower))
        or desc_lower.startswith("conductor - user manual verification")
    )


def _parse_task_line(line: str, task_num: int) -> Optional[TaskInfo]:
    """Parses a top-level markdown task checkbox line into a TaskInfo instance."""
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
    # Only treat trailing bare hex strings as SHAs on completed/skipped tasks so pending hex words are preserved.
    if not sha_match and status in ("complete", "skipped"):
        sha_match = TASK_SHA_BARE_RE.search(task_desc)

    if sha_match:
        commit_sha = next((g for g in sha_match.groups() if g is not None), None)
        clean_desc = task_desc[: sha_match.start()].strip()
    else:
        clean_desc = task_desc

    clean_desc = _TRAILING_CHECKPOINT_RE.sub("", clean_desc).strip()
    clean_desc = _WHITESPACE_RE.sub(" ", clean_desc).strip()

    return TaskInfo(
        task_num=task_num,
        description=clean_desc,
        status=status,
        status_char=status_char,
        is_checkpoint=is_checkpoint_task(clean_desc),
        commit_sha=commit_sha,
        exempt=exempt_cat,
        subtasks=[],
        raw_line=line.strip(),
    )


def parse_plan_markdown(content: str) -> Dict[int, PhaseInfo]:
    """Parses Conductor plan.md markdown content into ordered PhaseInfo records."""
    phases: Dict[int, PhaseInfo] = {}
    current_phase: Optional[PhaseInfo] = None
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
            phase_num = int(raw_num) if raw_num else ((max(phases.keys()) + 1) if phases else 1)

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

        if current_phase is None:
            continue

        target_tasks = current_phase.review_fixes if in_review_fixes else current_phase.tasks

        subtask_match = SUBTASK_RE.match(line)
        if subtask_match and target_tasks:
            target_tasks[-1].subtasks.append(subtask_match.group(2).strip())
            continue

        task_info = _parse_task_line(line, task_num=len(target_tasks) + 1)
        if task_info is not None:
            target_tasks.append(task_info)

    for phase in phases.values():
        phase.is_complete = bool(phase.checkpoint_sha)

    return phases


def parse_plan_file(plan_path: Optional[Path]) -> Dict[int, PhaseInfo]:
    """Reads a plan.md file if present and parses its markdown into PhaseInfo objects."""
    if not plan_path or not plan_path.is_file():
        return {}
    return parse_plan_markdown(plan_path.read_text(encoding="utf-8"))
