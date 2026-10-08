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
    python3 scripts/generate-prompt.py 3 1 --red       # Force Red phase prompt (failing tests only)
    python3 scripts/generate-prompt.py 3 1 --green     # Force Green phase prompt (implement to pass tests)
    python3 scripts/generate-prompt.py 3 1 --full      # Force Full TDD cycle prompt (Red -> Green -> Refactor)
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


def resolve_track_dir(track_name):
    """Resolves track directory path whether active or archived."""
    if not track_name:
        return None
    # 1. Direct path (absolute or relative to current working directory or PROJECT_ROOT)
    p = Path(track_name)
    if not p.is_absolute():
        p = (PROJECT_ROOT / p).resolve()
    if p.is_dir() and (p / "plan.md").exists():
        return p

    # 2. Bare track name under conductor/tracks/
    tracks_dir = (PROJECT_ROOT / "conductor" / "tracks" / track_name).resolve()
    if tracks_dir.is_dir():
        return tracks_dir

    # 3. Bare track name under conductor/archive/
    archive_dir = (PROJECT_ROOT / "conductor" / "archive" / track_name).resolve()
    if archive_dir.is_dir():
        return archive_dir

    return tracks_dir


def derive_scope(track_name):
    """Derives a sensible git commit scope from the track name."""
    base = Path(track_name).name.split("_")[0]
    parts = base.split("-")
    return parts[0] if parts else "core"


def parse_plan_tasks(track_name):
    """Parses phases, tasks, and subtasks from track plan.md."""
    track_dir = resolve_track_dir(track_name)
    plan_path = track_dir / "plan.md" if track_dir else None
    if not plan_path or not plan_path.exists():
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

        if current_phase_num is not None:
            # Check indented subtask first (indented by 2+ spaces or tabs before - [ ])
            subtask_match = re.match(r"^(?:\s{2,}|\t+)-\s*\[([ x~X])\]\s*(.*)", line)
            if subtask_match and phases[current_phase_num]["tasks"]:
                phases[current_phase_num]["tasks"][-1]["subtasks"].append(subtask_match.group(2).strip())
                continue

            # Top-level Task item (starts at line start)
            task_match = re.match(r"^-\s*\[([ x~X])\]\s+(?:Task(?:\s+\d+)?:)?\s*(.*)", line)
            if task_match:
                status_char = task_match.group(1).lower()
                task_desc = task_match.group(2).strip()
                clean_desc = re.sub(r"\s*(\([a-f0-9]{7,40}\)|\[[a-f0-9]{7,40}\]|\[checkpoint:[^\]]+\])$", "", task_desc).strip()
                phases[current_phase_num]["tasks"].append({
                    "status": "complete" if status_char == "x" else ("in_progress" if status_char == "~" else "pending"),
                    "description": clean_desc,
                    "subtasks": []
                })

    return phases


def find_next_pending_task(phases):
    """Finds the first pending (or in_progress) phase and task number."""
    for phase_num in sorted(phases.keys()):
        for task_idx, task in enumerate(phases[phase_num]["tasks"], start=1):
            if task["status"] in ("pending", "in_progress"):
                return phase_num, task_idx, task["description"], task.get("subtasks", [])
    return None, None, None, []


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


def infer_verification_strategy(track_name, phase_num, task_num, task_desc="", subtasks=None, mode=None):
    """Infers the optimal targeted verification strategy and commit message
    by inspecting the task description, subtasks, target files, and plan document."""
    scope = derive_scope(track_name)
    track_dir = resolve_track_dir(track_name)
    plan_file = track_dir / f"phase-{phase_num}-task-{task_num}-plan.md" if track_dir else None

    plan_targets = []
    plan_verification_cmds = []

    if plan_file and plan_file.exists():
        content = plan_file.read_text(encoding="utf-8")

        # 1. Extract target files mentioned in the plan
        target_matches = re.findall(
            r"(?:###\s+(?:Target\s+)?File\s+\d+:\s*(?:\[([^\]]+)\]|`([^`]+)`)|- \*\*Path:\*\*\s*`([^`]+)`|####\s+\[(?:MODIFY|NEW|DELETE)\]\s+([^\n\r]+))",
            content,
        )
        for m in target_matches:
            path_str = m[0] or m[1] or m[2] or m[3]
            if path_str:
                path_str = path_str.strip().strip("`")
                # Exclude plan tracking files
                if not path_str.startswith("conductor/"):
                    if path_str not in plan_targets:
                        plan_targets.append(path_str)

        # 2. Extract commands from Execution Verification Protocol / Plan section
        proto_match = re.search(
            r"##\s+(?:\d+\.\s+)?(?:Execution\s+Verification\s+Protocol|(?:Empirical\s+)?Verification\s+Plan|(?:Execution\s+&\s+)?Verification\s+Command)\b.*?\n(.*?)(?=\n##\s|\Z)",
            content,
            re.DOTALL | re.IGNORECASE,
        )
        if proto_match:
            proto_text = proto_match.group(1)
            bash_blocks = re.findall(r"```bash\s*\n(.*?)```", proto_text, re.DOTALL)
            for block in bash_blocks:
                flattened = re.sub(r"\\\s*\n\s*", " ", block)
                for cmd_line in flattened.splitlines():
                    cmd_line = cmd_line.strip()
                    if cmd_line and not cmd_line.startswith("#"):
                        if cmd_line not in plan_verification_cmds:
                            plan_verification_cmds.append(cmd_line)
                        # Extract test files mentioned directly in plan verification commands
                        for tf in re.findall(r"(?:^|\s)([a-zA-Z0-9_\-/\.]+\.(?:test|spec)\.[tj]sx?)(?:\s|$)", cmd_line):
                            if tf not in plan_targets and not tf.startswith("conductor/"):
                                plan_targets.append(tf)

    if subtasks is None:
        subtasks = []

    all_task_text = task_desc + "\n" + "\n".join(subtasks)
    desc_lower = all_task_text.lower()
    task_desc_lower = task_desc.lower()

    # Determine execution mode: 'red', 'green', or 'full'
    if mode in ("red", "green", "full"):
        resolved_mode = mode
    else:
        # Intelligent default based on task_desc (NEVER let subtasks alone force Red-only halt)
        if (
            task_desc_lower.startswith("write failing")
            or "red phase" in task_desc_lower
            or "(red)" in task_desc_lower
            or "failing unit test" in task_desc_lower
            or "failing test" in task_desc_lower
            or "failing integration" in task_desc_lower
        ):
            resolved_mode = "red"
        elif (
            task_desc_lower.startswith("implement")
            or "green phase" in task_desc_lower
            or "(green)" in task_desc_lower
            or task_desc_lower.startswith("fix ")
            or task_desc_lower.startswith("refactor ")
        ):
            resolved_mode = "green"
        elif "(tdd)" in task_desc_lower or (
            any("failing" in st.lower() for st in subtasks)
            and any("implement" in st.lower() or "update" in st.lower() or "green" in st.lower() for st in subtasks)
        ):
            resolved_mode = "full"
        else:
            resolved_mode = "green"

    is_red = (resolved_mode == "red")

    # Only fall back to regex scanning task_desc/subtasks if the task plan did not define any targets
    if not plan_targets and not plan_verification_cmds:
        test_file_matches = re.findall(r"(?:`|'|\")?([a-zA-Z0-9_\-/\.]+\.(?:test|spec)\.[tj]sx?)(?:`|'|\")?", all_task_text)
        for tf in test_file_matches:
            if tf not in plan_targets and not tf.startswith("conductor/"):
                plan_targets.append(tf)

    def clean_test_paths(paths):
        unique_paths = []
        for p in paths:
            if p not in unique_paths:
                unique_paths.append(p)
        # If both a full path ('dir/foo.test.ts') and bare basename ('foo.test.ts') exist, discard bare basename
        refined = []
        for p in unique_paths:
            if "/" not in p and any(other != p and other.endswith("/" + p) for other in unique_paths):
                continue
            refined.append(p)
        return refined

    spec_files = clean_test_paths([t for t in plan_targets if t.endswith(".spec.ts") or t.startswith("e2e/")])
    unit_files = clean_test_paths([t for t in plan_targets if ".test." in t])
    edge_files = clean_test_paths([t for t in plan_targets if "supabase/functions" in t])

    has_spec = len(spec_files) > 0 or "e2e" in desc_lower or "playwright" in desc_lower
    has_unit = len(unit_files) > 0 or "unit test" in desc_lower or ".test." in desc_lower
    has_edge = len(edge_files) > 0 or "edge function" in desc_lower or "deno" in desc_lower
    wants_type_check = "type-check" in desc_lower or "type checking" in desc_lower or "types pass" in desc_lower
    is_full_suite = (
        "full automated" in desc_lower
        or "full test suite" in desc_lower
        or "regression verification" in desc_lower
        or "type verification" in desc_lower
        or "quality gates" in desc_lower
        or "repository-wide verification" in desc_lower
    )

    # Look for explicit executable commands in subtasks (e.g. `npm run db:check-types:local`, `npm run lint`)
    explicit_subtask_cmds = []
    for line in subtasks:
        for m in re.findall(r"`([a-zA-Z0-9_\-:\./\s]+)`", line):
            m = m.strip()
            if any(m.startswith(prefix) for prefix in ["npm ", "./scripts/", "npx ", "node ", "pytest ", "deno "]):
                if m not in explicit_subtask_cmds:
                    explicit_subtask_cmds.append(m)

    default_verb = (
        "test"
        if is_red
        else (
            "refactor"
            if "refactor" in task_desc_lower
            else ("chore" if ("cleanup" in task_desc_lower or "scaffolding" in task_desc_lower) else "feat")
        )
    )

    if is_full_suite:
        # Full automated regression run
        target_spec = (" " + " ".join(spec_files)) if spec_files else ""
        commands = [
            "./scripts/run-jest-container.sh",
            "npm run type-check",
        ]
        if has_spec or spec_files:
            commands.append(f"./scripts/run-e2e-container.sh webkit{target_spec}".strip())
        instruction = "- Verify full test suite and TypeScript types pass cleanly before committing."
        commit_msg = f"{default_verb}({scope}): {task_desc or f'Execute full automated test suite for Phase {phase_num} Task {task_num}'}"
    elif is_red:
        # Red phase: failing tests
        if plan_verification_cmds:
            commands = plan_verification_cmds
        elif has_spec and not has_unit:
            target_arg = (" " + " ".join(spec_files)) if spec_files else ""
            commands = [f"./scripts/run-e2e-container.sh webkit{target_arg}".strip()]
        else:
            target_arg = (" " + " ".join(unit_files)) if unit_files else ""
            commands = [f"./scripts/run-jest-container.sh{target_arg}".strip()]
        instruction = "- Confirm new tests fail with expected assertions (Red phase). DO NOT implement application code."
        commit_msg = f"test({scope}): {task_desc or f'Add failing tests for Phase {phase_num} Task {task_num}'}"
    elif has_spec and has_unit:
        # Both unit tests and E2E specs targeted
        target_spec = (" " + " ".join(spec_files)) if spec_files else ""
        unit_arg = (" " + " ".join(unit_files)) if unit_files else ""
        commands = [
            f"./scripts/run-jest-container.sh{unit_arg}".strip(),
            f"./scripts/run-e2e-container.sh webkit{target_spec}".strip(),
        ]
        if wants_type_check:
            commands.append("npm run type-check")
        instruction = "- Verify unit tests and newly created/modified E2E specs pass cleanly before committing."
        commit_msg = f"{default_verb}({scope}): {task_desc or f'Implement Phase {phase_num} Task {task_num}'}"
    elif has_spec and not has_unit:
        # Pure E2E spec task
        target_arg = (" " + " ".join(spec_files)) if spec_files else ""
        commands = [f"./scripts/run-e2e-container.sh webkit{target_arg}".strip()]
        if wants_type_check:
            commands.append("npm run type-check")
        instruction = "- Verify targeted E2E suite passes cleanly in WebKit."
        commit_msg = f"{default_verb}({scope}): {task_desc or f'Implement Phase {phase_num} Task {task_num}'}"
    elif has_edge and not has_unit and not has_spec:
        commands = ["npm run test:functions"]
        if wants_type_check:
            commands.append("npm run type-check")
        instruction = "- Verify edge function tests pass cleanly."
        commit_msg = f"{default_verb}({scope}): {task_desc or f'Implement Phase {phase_num} Task {task_num}'}"
    elif has_unit:
        # Targeted unit tests
        if plan_verification_cmds:
            commands = plan_verification_cmds
        elif unit_files:
            target_arg = " " + " ".join(unit_files)
            commands = [f"./scripts/run-jest-container.sh{target_arg}".strip()]
        elif explicit_subtask_cmds:
            commands = explicit_subtask_cmds
            instruction = "- Run targeted verification commands and confirm all checks pass cleanly."
        else:
            commands = ["./scripts/run-jest-container.sh"]
        if wants_type_check and not any("type-check" in c for c in commands):
            commands.append("npm run type-check")
        if not (not unit_files and explicit_subtask_cmds):
            instruction = "- Verify targeted unit/integration tests pass cleanly (Green phase)."
        commit_msg = f"{default_verb}({scope}): {task_desc or f'Implement Phase {phase_num} Task {task_num}'}"
    elif plan_verification_cmds:
        commands = plan_verification_cmds
        instruction = "- Execute the verification protocol from the plan and confirm all checks pass."
        commit_msg = f"{default_verb}({scope}): {task_desc or f'Implement Phase {phase_num} Task {task_num}'}"
    elif explicit_subtask_cmds:
        commands = explicit_subtask_cmds
        if wants_type_check and not any("type-check" in c or "check-types" in c for c in commands):
            commands.append("npm run type-check")
        instruction = "- Run targeted verification commands and confirm all checks pass cleanly."
        commit_msg = f"{default_verb}({scope}): {task_desc or f'Implement Phase {phase_num} Task {task_num}'}"
    else:
        commands = ["./scripts/run-jest-container.sh"]
        if wants_type_check:
            commands.append("npm run type-check")
        instruction = "- Run containerized Jest to verify tests pass (Green phase)."
        commit_msg = f"{default_verb}({scope}): {task_desc or f'Implement Phase {phase_num} Task {task_num}'}"

    return {
        "commands": commands,
        "instruction": instruction,
        "commit_msg": commit_msg,
        "mode": resolved_mode,
        "is_red": is_red,
    }


def build_plan_prompt(track_name, phase_num, task_num, task_desc=""):
    track_dir = resolve_track_dir(track_name)
    rel_track_dir = track_dir.relative_to(PROJECT_ROOT) if track_dir else f"conductor/tracks/{track_name}"
    plan_file = f"{rel_track_dir}/phase-{phase_num}-task-{task_num}-plan.md"
    task_focus = f" for '{task_desc}'" if task_desc else ""

    return f"""/conductor:implement @[{rel_track_dir}] Plan Phase {phase_num} Task {task_num} only{task_focus}.

Gate & Planning Protocol:
- Perform static inspection only (NO test runners, build commands, or background docs). Seam-bounded inspection.
- Write the implementation plan directly to: {plan_file}
- CRITICAL: The plan must provide EXACT drop-in code blocks (imports, functions, replacement chunks) and precise line anchors for target files so the executor does not need to inspect surrounding files.
- CRITICAL: If introducing or modifying test files (unit, integration, or E2E), the plan's Execution Verification Protocol MUST specify the exact command to run those tests (e.g. ./scripts/run-e2e-container.sh webkit <spec> or ./scripts/run-jest-container.sh <test>). Never leave new test code unverified in the execution phase.
- CRITICAL: In the plan's Post-Execution section, format the `git notes add` command using the standard fields: Task, Summary, Files, and Rationale.
- Halt for user approval via modal before modifying any files."""


def build_exec_prompt(track_name, phase_num, task_num, task_desc="", subtasks=None, mode=None):
    track_dir = resolve_track_dir(track_name)
    rel_track_dir = track_dir.relative_to(PROJECT_ROOT) if track_dir else f"conductor/tracks/{track_name}"
    plan_file = f"{rel_track_dir}/phase-{phase_num}-task-{task_num}-plan.md"
    strategy = infer_verification_strategy(track_name, phase_num, task_num, task_desc, subtasks, mode)

    cmd_lines = "\n".join(f"     {c}" for c in strategy["commands"])

    if strategy["mode"] == "red":
        verification_block = f"""3. Targeted Verification (Red Phase):
   - Run containerized test runner to confirm new tests fail with expected assertions:
{cmd_lines}
   - DO NOT implement application code. Verify failures match expectations."""
    elif strategy["mode"] == "full":
        verification_block = f"""3. Targeted Verification (Full TDD Cycle):
   - Step 3.1 (Red Phase): Run containerized test runner to confirm new tests fail with expected assertions:
{cmd_lines}
   - Step 3.2 (Green Phase): Implement application code in target files and re-run runner:
{cmd_lines}
   {strategy['instruction']}
   - Confirm all tests pass cleanly. Do NOT commit failing tests."""
    else:
        verification_block = f"""3. Targeted Verification:
   - Run targeted test runner for created/modified files:
{cmd_lines}
   {strategy['instruction']}
   - If tests fail, diagnose within the target seam, adjust code/fixtures, and re-verify. Do NOT commit failing tests."""

    return f"""Execute Phase {phase_num} Task {task_num} strictly following @{plan_file}.

Execution Directives (Seam-Bounded & Empirically Verified):
1. The plan is 100% authoritative. Stay strictly within the planned seam (DO NOT view unmentioned files or explore git history).
2. Proceed immediately to apply planned additions or edits using write_to_file or replace_file_content.
{verification_block}
4. Once verified, commit changes with message: "{strategy['commit_msg']}", record git notes in line with conductor/workflow.md, append [commit: <hash>] to the completed task line in plan.md, and commit plan.md.
5. Halt immediately after commit."""


def build_recovery_prompt(track_name, phase_num, task_num):
    track_dir = resolve_track_dir(track_name)
    rel_track_dir = track_dir.relative_to(PROJECT_ROOT) if track_dir else f"conductor/tracks/{track_name}"
    return f"""/conductor:implement @[{rel_track_dir}]

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

    phase_group = parser.add_mutually_exclusive_group()
    phase_group.add_argument("--red", action="store_true", help="Force Red phase prompt (failing tests only, halt after test commit)")
    phase_group.add_argument("--green", action="store_true", help="Force Green phase prompt (implement application code to pass tests)")
    phase_group.add_argument("--full", action="store_true", help="Force Full TDD prompt (write tests, verify Red, implement, verify Green)")

    parsed = parser.parse_args()

    track_name = parsed.track
    phase_num = parsed.phase
    task_num = parsed.task

    # Determine explicit execution mode from CLI flags
    mode = None
    if parsed.red:
        mode = "red"
    elif parsed.green:
        mode = "green"
    elif parsed.full:
        mode = "full"

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
    subtasks = []
    if phase_num is None or task_num is None:
        auto_p, auto_t, auto_desc, auto_subtasks = find_next_pending_task(phases)
        if auto_p is not None:
            phase_num = phase_num or auto_p
            task_num = task_num or auto_t
            task_desc = auto_desc
            subtasks = auto_subtasks
        else:
            phase_num = phase_num or 1
            task_num = task_num or 1
            if phase_num in phases and 0 < task_num <= len(phases[phase_num]["tasks"]):
                task_desc = phases[phase_num]["tasks"][task_num - 1]["description"]
                subtasks = phases[phase_num]["tasks"][task_num - 1].get("subtasks", [])
    elif phase_num in phases and 0 < task_num <= len(phases[phase_num]["tasks"]):
        task_desc = phases[phase_num]["tasks"][task_num - 1]["description"]
        subtasks = phases[phase_num]["tasks"][task_num - 1].get("subtasks", [])

    if parsed.recovery:
        rec_prompt = build_recovery_prompt(track_name, phase_num, task_num)
        print(rec_prompt)
        if parsed.copy:
            copied = copy_to_clipboard(rec_prompt)
            if copied:
                print("\n[Copied recovery prompt to clipboard]", file=sys.stderr)
        return

    plan_prompt = build_plan_prompt(track_name, phase_num, task_num, task_desc)
    exec_prompt = build_exec_prompt(track_name, phase_num, task_num, task_desc, subtasks, mode)

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
