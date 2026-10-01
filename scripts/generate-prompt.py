#!/usr/bin/env python3
"""
Conductor Prompt Generator for Antigravity-CLI

Generates optimized Planner and Executor prompts for Conductor tracks,
implementing zero-amnesia mode, strict TDD separation, and token-efficient gates.

Usage:
    python3 scripts/generate-prompt.py [track] [phase] [task]
    python3 scripts/generate-prompt.py 3 1             # Auto-detects active track
    python3 scripts/generate-prompt.py                 # Auto-detects active track and next pending task
    python3 scripts/generate-prompt.py 3 1 --plan      # Outputs only the plan prompt
    python3 scripts/generate-prompt.py 3 1 --exec      # Outputs only the exec prompt
    python3 scripts/generate-prompt.py 3 1 --copy-plan # Copies plan prompt to clipboard
    python3 scripts/generate-prompt.py 3 1 --copy-exec # Copies exec prompt to clipboard
    python3 scripts/generate-prompt.py --recovery      # Outputs recovery prompt for uncommitted changes
"""

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TRACKS_REGISTRY = PROJECT_ROOT / "conductor" / "tracks.md"


def get_active_track():
    """Detects in-progress or available track from conductor/tracks.md."""
    if not TRACKS_REGISTRY.exists():
        return None

    content = TRACKS_REGISTRY.read_text(encoding="utf-8")
    
    # Priority 1: Track marked [~] In Progress
    in_progress = re.findall(r"\|\s*\*\*([a-zA-Z0-9_\-]+)\*\*\s*\|.*?\|\s*\[~\]", content)
    if in_progress:
        return in_progress[0]

    # Priority 2: Next incomplete track [ ]
    pending = re.findall(r"\|\s*\*\*([a-zA-Z0-9_\-]+)\*\*\s*\|.*?\|\s*\[ \]", content)
    if pending:
        return pending[0]

    # Priority 3: Any track directory under conductor/tracks/
    tracks_dir = PROJECT_ROOT / "conductor" / "tracks"
    if tracks_dir.exists():
        tracks = [d.name for d in tracks_dir.iterdir() if d.is_dir() and not d.name.startswith(".")]
        if tracks:
            return tracks[0]

    return None


def derive_scope(track_name):
    """Derives a sensible git commit scope from the track name."""
    base = track_name.split("_")[0]
    parts = base.split("-")
    return parts[0] if parts else "core"


def parse_plan_tasks(track_name):
    """Parses phases and tasks from conductor/tracks/<track_name>/plan.md."""
    plan_path = PROJECT_ROOT / "conductor" / "tracks" / track_name / "plan.md"
    if not plan_path.exists():
        return {}

    content = plan_path.read_text(encoding="utf-8")
    phases = {}
    current_phase_num = None

    for line in content.splitlines():
        # Phase header: e.g., ## Phase 2: On-Demand Enrichment... or ### Phase 1:...
        phase_match = re.match(r"^#{2,3}\s+Phase\s+(\d+)[:\s]+(.*)", line, re.IGNORECASE)
        if phase_match:
            current_phase_num = int(phase_match.group(1))
            phases[current_phase_num] = {
                "name": phase_match.group(2).strip(),
                "tasks": []
            }
            continue

        # Top-level Task item (ignoring indented subtasks): e.g., - [ ] Task: ..., - [x] Task 1: ...
        if current_phase_num is not None:
            # Must start at beginning of line (non-indented) to distinguish task from subtasks
            task_match = re.match(r"^-\s*\[([ x~X])\]\s+(?:Task(?:\s+\d+)?:)?\s*(.*)", line)
            if task_match:
                status_char = task_match.group(1).lower()
                task_desc = task_match.group(2).strip()
                # Clean up trailing commit hashes or checkpoint tags: (887fc12d) or [checkpoint: 78afad4]
                clean_desc = re.sub(r"\s*(\([a-f0-9]{7,40}\)|\[[a-f0-9]{7,40}\]|\[checkpoint:[^\]]+\])$", "", task_desc).strip()
                phases[current_phase_num]["tasks"].append({
                    "status": "complete" if status_char == "x" else ("in_progress" if status_char == "~" else "pending"),
                    "description": clean_desc
                })

    return phases


def find_next_pending_task(phases):
    """Finds the first pending (or in_progress) phase and task number."""
    for phase_num in sorted(phases.keys()):
        for task_idx, task in enumerate(phases[phase_num]["tasks"], start=1):
            if task["status"] in ("pending", "in_progress"):
                return phase_num, task_idx, task["description"]
    return None, None, None


def copy_to_clipboard(text):
    """Attempts to copy text to system clipboard via xclip, wl-copy, pbcopy, or xsel."""
    tools = [
        ["xclip", "-selection", "clipboard"],
        ["wl-copy"],
        ["pbcopy"],
        ["xsel", "--clipboard", "--input"],
    ]
    for cmd in tools:
        try:
            p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
            p.communicate(input=text.encode("utf-8"))
            if p.returncode == 0:
                return True
        except (FileNotFoundError, OSError):
            continue
    return False


def build_plan_prompt(track_name, phase_num, task_num, task_desc=""):
    plan_file = f"conductor/tracks/{track_name}/phase-{phase_num}-task-{task_num}-plan.md"
    task_focus = f" for '{task_desc}'" if task_desc else ""

    return f"""/conductor:implement @[conductor/tracks/{track_name}] Plan Phase {phase_num} Task {task_num} only{task_focus}.

Gate & Planning Protocol:
- Perform static inspection only (NO test runners, build commands, or background docs). Seam-bounded inspection.
- Write the implementation plan directly to: {plan_file}
- CRITICAL: The plan must provide EXACT drop-in code blocks (imports, functions, replacement chunks) and precise line anchors for target files so the executor does not need to inspect surrounding files.
- Halt for user approval via modal before modifying any files."""


def build_exec_prompt(track_name, phase_num, task_num, task_desc="", is_red_phase=False):
    plan_file = f"conductor/tracks/{track_name}/phase-{phase_num}-task-{task_num}-plan.md"
    scope = derive_scope(track_name)

    # Infer commit message and verification directive
    if is_red_phase or (task_desc and ("failing unit" in task_desc.lower() or "red phase" in task_desc.lower())):
        verification_line = "3. Run containerized Jest ONCE to confirm all new tests fail with expected assertions (Red phase). DO NOT implement application code."
        commit_msg = f"test({scope}): {task_desc or f'Add failing tests for Phase {phase_num} Task {task_num}'}"
    else:
        verification_line = "3. Run containerized Jest ONCE after all edits are applied to verify tests pass (Green phase)."
        commit_msg = f"feat({scope}): {task_desc or f'Implement Phase {phase_num} Task {task_num}'}"

    return f"""Execute Phase {phase_num} Task {task_num} strictly following @{plan_file}.

Execution Directives (Zero-Amnesia Mode):
1. The plan is 100% authoritative and contains exact drop-in replacements.
2. DO NOT run git log, git show, or view unmentioned files. Proceed immediately to Step 1: apply planned edits to target files using replace_file_content.
{verification_line}
4. Update plan.md, record git notes, and commit with message: "{commit_msg}"
5. Halt immediately after commit."""


def build_recovery_prompt(track_name, phase_num, task_num):
    return f"""/conductor:implement @[conductor/tracks/{track_name}]

Pick up uncommitted changes in git status for Phase {phase_num}, Task {task_num}.
Verify with tests, commit, update plan.md, and halt."""


def main():
    parser = argparse.ArgumentParser(
        description="Generate token-efficient Conductor prompts for Antigravity-CLI.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Examples:
  python3 scripts/generate-prompt.py                 # Auto-detects track & next pending task
  python3 scripts/generate-prompt.py 3 1             # Phase 3 Task 1 for active track
  python3 scripts/generate-prompt.py 3 1 --plan      # Output only Phase 3 Task 1 Plan prompt
  python3 scripts/generate-prompt.py 3 1 --exec      # Output only Phase 3 Task 1 Exec prompt
  python3 scripts/generate-prompt.py 3 1 --copy-plan # Copy Plan prompt directly to clipboard
  python3 scripts/generate-prompt.py 3 1 --copy-exec # Copy Exec prompt directly to clipboard
  python3 scripts/generate-prompt.py --recovery      # Output recovery prompt for uncommitted changes
"""
    )

    parser.add_argument("args", nargs="*", help="[track] [phase] [task] or [phase] [task]")
    parser.add_argument("--track", "-t", help="Track name (e.g. winery-hours-resilience_20260930)")
    parser.add_argument("--phase", "-p", type=int, help="Phase number (e.g. 2)")
    parser.add_argument("--task", "-k", type=int, help="Task number (e.g. 1)")
    parser.add_argument("--plan-only", "--plan", action="store_true", help="Output only the Plan prompt")
    parser.add_argument("--exec-only", "--exec", action="store_true", help="Output only the Implementation prompt")
    parser.add_argument("--copy", "-c", action="store_true", help="Copy output prompt to clipboard")
    parser.add_argument("--copy-plan", action="store_true", help="Copy the Plan prompt to clipboard")
    parser.add_argument("--copy-exec", action="store_true", help="Copy the Exec prompt to clipboard")
    parser.add_argument("--recovery", "-r", action="store_true", help="Generate recovery prompt for uncommitted work")

    parsed = parser.parse_args()

    track_name = parsed.track
    phase_num = parsed.phase
    task_num = parsed.task

    # Parse positional arguments if provided
    pos_args = parsed.args
    if len(pos_args) == 3:
        track_name, phase_num, task_num = pos_args[0], int(pos_args[1]), int(pos_args[2])
    elif len(pos_args) == 2:
        # e.g., 3 1 -> phase 3, task 1 (track auto-detected)
        if pos_args[0].isdigit() and pos_args[1].isdigit():
            phase_num, task_num = int(pos_args[0]), int(pos_args[1])
        else:
            track_name, phase_num = pos_args[0], int(pos_args[1])
    elif len(pos_args) == 1:
        if pos_args[0].isdigit():
            phase_num = int(pos_args[0])
        else:
            track_name = pos_args[0]

    # Resolve active track if not specified
    if not track_name:
        track_name = get_active_track()
        if not track_name:
            print("Error: Could not auto-detect active track. Please specify track name.", file=sys.stderr)
            sys.exit(1)

    phases = parse_plan_tasks(track_name)

    # Auto-resolve next pending task if not specified
    task_desc = ""
    if phase_num is None or task_num is None:
        auto_p, auto_t, auto_desc = find_next_pending_task(phases)
        if auto_p is not None:
            phase_num = phase_num or auto_p
            task_num = task_num or auto_t
            task_desc = auto_desc
        else:
            phase_num = phase_num or 1
            task_num = task_num or 1
    elif phase_num in phases and 0 < task_num <= len(phases[phase_num]["tasks"]):
        task_desc = phases[phase_num]["tasks"][task_num - 1]["description"]

    is_red = "failing unit" in task_desc.lower() or "red phase" in task_desc.lower()

    if parsed.recovery:
        rec_prompt = build_recovery_prompt(track_name, phase_num, task_num)
        print(rec_prompt)
        if parsed.copy:
            copied = copy_to_clipboard(rec_prompt)
            if copied:
                print("\n[Copied recovery prompt to clipboard]", file=sys.stderr)
        return

    plan_prompt = build_plan_prompt(track_name, phase_num, task_num, task_desc)
    exec_prompt = build_exec_prompt(track_name, phase_num, task_num, task_desc, is_red)

    if parsed.copy_plan or (parsed.copy and parsed.plan_only):
        copied = copy_to_clipboard(plan_prompt)
        print(plan_prompt)
        if copied:
            print("\n[Copied Plan prompt to clipboard]", file=sys.stderr)
        return

    if parsed.copy_exec or (parsed.copy and parsed.exec_only):
        copied = copy_to_clipboard(exec_prompt)
        print(exec_prompt)
        if copied:
            print("\n[Copied Exec prompt to clipboard]", file=sys.stderr)
        return

    if parsed.plan_only:
        print(plan_prompt)
        return

    if parsed.exec_only:
        print(exec_prompt)
        return

    line = "─" * 72
    # Print both with clear headers
    print(f"\n{line}")
    print(f"  CONDUCTOR PROMPTS: {track_name} (Phase {phase_num}, Task {task_num})")
    if task_desc:
        print(f"  Target: {task_desc}")
    print(f"{line}\n")

    print("═══════════════════ PROMPT 1: RESEARCH & PLAN (SESSION 1) ═══════════════════\n")
    print(plan_prompt)
    print("\n═══════════════════ PROMPT 2: IMPLEMENTATION (SESSION 2) ════════════════════\n")
    print(exec_prompt)
    print(f"\n{line}\n")
    print("Tip: Use --copy-plan or --copy-exec to send directly to your clipboard.")


if __name__ == "__main__":
    main()
