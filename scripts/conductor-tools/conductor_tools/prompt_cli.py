"""Portable `conductor-prompt` CLI entrypoint and prompt router."""

from __future__ import annotations

import argparse
from pathlib import Path
import re
import sys
from typing import Optional, Sequence

from conductor_tools import git_scope, parser, strategy as strategy_mod, templates
from conductor_tools.models import (
    ConductorError,
    PhaseInfo,
    PromptMode,
    TaskInfo,
    TrackPlan,
)
from conductor_tools.profile import load_repo_profile

__all__ = ["build_parser", "main"]

_INT_TOKEN_RE = re.compile(r"^[+-]?\d+$")
_BOX_LINE = "─" * 72


def build_parser() -> argparse.ArgumentParser:
    """Build and return the argument parser for `conductor-prompt`."""
    arg_parser = argparse.ArgumentParser(
        description="Generate token-efficient Conductor prompts for Antigravity-CLI.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  conductor-prompt                      # Auto-detects track & next pending task\n"
            "  conductor-prompt --checkpoint -c      # Copy active phase Checkpoint prompt\n"
            "  conductor-prompt --checkpoint -u      # Unattended checkpoint without modal pauses\n"
            "  conductor-prompt --review             # Generate Gate 2 phase review prompt\n"
            "  conductor-prompt 3 1 --plan           # Output only Phase 3 Task 1 Plan prompt\n"
            "  conductor-prompt 3 1 --exec           # Output only Phase 3 Task 1 Exec prompt\n"
            "  conductor-prompt 3 1 --copy-plan      # Copy Plan prompt directly to clipboard\n"
            "  conductor-prompt 3 1 --copy-exec      # Copy Exec prompt directly to clipboard\n"
            "  conductor-prompt -r                   # Output recovery prompt for uncommitted work\n"
        ),
    )

    arg_parser.add_argument(
        "args",
        nargs="*",
        help="[track] [phase] [task] or [phase] [task] (or [track] [phase] under --review)",
    )
    arg_parser.add_argument(
        "-C",
        "--repo-root",
        dest="repo_root",
        type=str,
        default=None,
        help="Repository root containing conductor/ (defaults to cwd discovery)",
    )
    arg_parser.add_argument(
        "-t",
        "--track",
        default=None,
        help="Track name (e.g. demo-track_20261117)",
    )
    arg_parser.add_argument("-p", "--phase", type=int, default=None, help="Phase number")
    arg_parser.add_argument("-k", "--task", type=int, default=None, help="Task number")
    arg_parser.add_argument(
        "--plan-only",
        "--plan",
        dest="plan_only",
        action="store_true",
        help="Output only the Plan prompt",
    )
    arg_parser.add_argument(
        "--exec-only",
        "--exec",
        dest="exec_only",
        action="store_true",
        help="Output only the Implementation prompt",
    )
    arg_parser.add_argument(
        "-c",
        "--copy",
        dest="copy",
        action="store_true",
        help="Copy output prompt to clipboard",
    )
    arg_parser.add_argument(
        "--copy-plan",
        action="store_true",
        help="Copy the Plan prompt to clipboard",
    )
    arg_parser.add_argument(
        "--copy-exec",
        action="store_true",
        help="Copy the Exec prompt to clipboard",
    )
    arg_parser.add_argument(
        "-r",
        "--recovery",
        action="store_true",
        help="Generate recovery prompt for uncommitted work",
    )
    arg_parser.add_argument(
        "-u",
        "--unattended",
        action="store_true",
        help="Generate unattended checkpoint prompt without interactive modal pauses",
    )
    arg_parser.add_argument(
        "--skip-plan",
        action="store_true",
        help="Generate direct execution prompt without requiring a Tier 1 task plan file",
    )
    arg_parser.add_argument(
        "--report-path",
        type=Path,
        default=None,
        help="Output report path for --review mode",
    )

    mode_group = arg_parser.add_mutually_exclusive_group()
    mode_group.add_argument(
        "--red",
        action="store_true",
        help="Force Red phase prompt (failing tests only, halt after test commit)",
    )
    mode_group.add_argument(
        "--green",
        action="store_true",
        help="Force Green phase prompt (implement application code to pass tests)",
    )
    mode_group.add_argument(
        "--checkpoint",
        action="store_true",
        help="Select the phase's User Manual Verification checkpoint task",
    )
    mode_group.add_argument(
        "--review",
        action="store_true",
        help="Generate Gate 2 phase review prompt",
    )

    return arg_parser


def _is_int_token(token: str) -> bool:
    """Return True when `token` is a signed or unsigned integer literal."""
    return bool(_INT_TOKEN_RE.match(token))


def _parse_int_token(token: str, label: str) -> int:
    """Parse `token` as an integer or raise `ConductorError`."""
    try:
        return int(token)
    except ValueError as exc:
        raise ConductorError(
            f"Invalid {label} number {token!r}: expected a positive integer."
        ) from exc


def _resolve_cli_coordinates(
    parsed: argparse.Namespace,
) -> tuple[Optional[str], Optional[int], Optional[int]]:
    """Resolve `(track_name, phase_num, task_num)` from positional args and flags."""
    track_name: Optional[str] = parsed.track
    phase_num: Optional[int] = parsed.phase
    task_num: Optional[int] = parsed.task
    pos_args: list[str] = list(parsed.args)

    if parsed.review:
        if parsed.task is not None:
            raise ConductorError("--task cannot be used with --review.")
        if len(pos_args) > 2:
            raise ConductorError(
                "Expected at most 2 positional arguments ([track] [phase]) with --review."
            )
        if len(pos_args) == 2:
            track_name = pos_args[0]
            phase_num = _parse_int_token(pos_args[1], "phase")
        elif len(pos_args) == 1:
            if _is_int_token(pos_args[0]):
                phase_num = int(pos_args[0])
            else:
                track_name = pos_args[0]
    else:
        if len(pos_args) > 3:
            raise ConductorError(
                "Expected at most 3 positional arguments ([track] [phase] [task])."
            )
        if len(pos_args) == 3:
            track_name = pos_args[0]
            phase_num = _parse_int_token(pos_args[1], "phase")
            task_num = _parse_int_token(pos_args[2], "task")
        elif len(pos_args) == 2:
            if _is_int_token(pos_args[0]) and _is_int_token(pos_args[1]):
                phase_num = int(pos_args[0])
                task_num = int(pos_args[1])
            elif _is_int_token(pos_args[0]):
                raise ConductorError(
                    f"Invalid task number {pos_args[1]!r}: expected a positive integer."
                )
            else:
                track_name = pos_args[0]
                phase_num = _parse_int_token(pos_args[1], "phase")
        elif len(pos_args) == 1:
            if _is_int_token(pos_args[0]):
                phase_num = int(pos_args[0])
            else:
                track_name = pos_args[0]

    if (phase_num is not None and phase_num <= 0) or (
        task_num is not None and task_num <= 0
    ):
        raise ConductorError(
            f"Phase and task numbers must be positive integers >= 1 "
            f"(got phase: {phase_num}, task: {task_num})."
        )

    return track_name, phase_num, task_num


def _find_first_pending_task(
    phases: dict[int, PhaseInfo],
) -> Optional[tuple[int, TaskInfo]]:
    """Return the first pending/in-progress `(phase_num, task)` across all phases."""
    for p_num in sorted(phases.keys()):
        for task in phases[p_num].tasks:
            if task.status in ("pending", "in_progress"):
                return (p_num, task)
    return None


def _require_phase(track_plan: TrackPlan, phase_num: int) -> PhaseInfo:
    """Return `PhaseInfo` for `phase_num` or raise a descriptive `ConductorError`."""
    if phase_num not in track_plan.phases:
        valid_phases = ", ".join(str(p) for p in sorted(track_plan.phases.keys()))
        raise ConductorError(
            f"Phase {phase_num} not found in track '{track_plan.track_name}'. "
            f"Available phases: {valid_phases}."
        )
    return track_plan.phases[phase_num]


def _require_task(phase_info: PhaseInfo, task_num: int) -> TaskInfo:
    """Return `TaskInfo` for `task_num` in `phase_info` or raise `ConductorError`."""
    resolved = next((t for t in phase_info.tasks if t.task_num == task_num), None)
    if resolved is None:
        total_tasks = len(phase_info.tasks)
        task_range_str = f"1..{total_tasks}" if total_tasks > 0 else "none"
        raise ConductorError(
            f"Task {task_num} not found in Phase {phase_info.phase_num} "
            f"('{phase_info.name}'). Valid tasks for Phase {phase_info.phase_num}: "
            f"{task_range_str}."
        )
    return resolved


def _resolve_phase_and_task(
    track_plan: TrackPlan,
    phase_num: Optional[int],
    task_num: Optional[int],
    *,
    is_checkpoint: bool,
) -> tuple[int, PhaseInfo, TaskInfo]:
    """Resolve `(phase_num, phase_info, task_info)` from optional CLI coordinates."""
    if is_checkpoint and task_num is None:
        if phase_num is None:
            pending = _find_first_pending_task(track_plan.phases)
            phase_num = (
                pending[0] if pending is not None else max(track_plan.phases.keys())
            )
        phase_info = _require_phase(track_plan, phase_num)
        candidates = [t for t in phase_info.tasks if t.is_checkpoint]
        if not candidates:
            raise ConductorError(
                f"No checkpoint/manual verification task found in "
                f"Phase {phase_num} ('{phase_info.name}')."
            )
        selected_task = next(
            (t for t in candidates if t.status not in ("complete", "skipped")),
            candidates[-1],
        )
        return phase_num, phase_info, selected_task

    if phase_num is None and task_num is None:
        pending = _find_first_pending_task(track_plan.phases)
        if pending is not None:
            p_num, selected_task = pending
            return p_num, track_plan.phases[p_num], selected_task
        resolved_phase_num = min(track_plan.phases.keys())
        phase_info = _require_phase(track_plan, resolved_phase_num)
        if not phase_info.tasks:
            raise ConductorError(
                f"Phase {resolved_phase_num} has no tasks defined in plan.md."
            )
        return resolved_phase_num, phase_info, phase_info.tasks[0]

    if phase_num is not None and task_num is None:
        phase_info = _require_phase(track_plan, phase_num)
        if not phase_info.tasks:
            raise ConductorError(
                f"Phase {phase_num} ('{phase_info.name}') has no tasks defined in plan.md."
            )
        selected_task = next(
            (t for t in phase_info.tasks if t.status in ("pending", "in_progress")),
            phase_info.tasks[0],
        )
        return phase_num, phase_info, selected_task

    if phase_num is None and task_num is not None:
        pending = _find_first_pending_task(track_plan.phases)
        resolved_phase_num = (
            pending[0] if pending is not None else min(track_plan.phases.keys())
        )
        phase_info = _require_phase(track_plan, resolved_phase_num)
        return resolved_phase_num, phase_info, _require_task(phase_info, task_num)

    assert phase_num is not None and task_num is not None
    phase_info = _require_phase(track_plan, phase_num)
    return phase_num, phase_info, _require_task(phase_info, task_num)


def _emit_prompt(prompt: str, *, copy: bool, label: str) -> None:
    """Print `prompt` to stdout and optionally copy it to the clipboard."""
    print(prompt)
    if copy and git_scope.copy_to_clipboard(prompt):
        print(f"\n[Copied {label} prompt to clipboard]", file=sys.stderr)


def _print_box_header(title: str, target_desc: str) -> None:
    """Print a framed header block for interactive dual/checkpoint output."""
    print(f"\n{_BOX_LINE}")
    print(f"  {title}")
    if target_desc:
        print(f"  Target: {target_desc}")
    print(f"{_BOX_LINE}\n")


def _run_cli(parsed: argparse.Namespace) -> int:
    """Execute prompt resolution and output routing for parsed CLI options."""
    track_name, phase_num, task_num = _resolve_cli_coordinates(parsed)

    repo_root = git_scope.resolve_repo_root(
        parsed.repo_root, script_path=Path(__file__)
    )
    profile = load_repo_profile(repo_root=repo_root)

    if not track_name:
        track_name = parser.get_active_track(repo_root, planning=profile.planning)
        if not track_name:
            raise ConductorError(
                "Could not auto-detect active track. Please specify track name."
            )

    track_dir = git_scope.resolve_track_dir(
        track_name, repo_root, planning=profile.planning
    )
    plan_path = track_dir / "plan.md" if track_dir is not None else None
    track_plan = (
        parser.parse_track_plan(track_dir, track_name=track_dir.name)
        if track_dir is not None
        else TrackPlan(
            track_name=track_name,
            track_dir=repo_root,
            plan_path=repo_root / "plan.md",
            phases={},
        )
    )
    if not track_plan.phases:
        raise ConductorError(
            f"No phases found in plan for track '{track_name}'. "
            f"Please verify that {plan_path or 'plan.md'} exists and defines phases."
        )

    if parsed.review:
        if phase_num is None:
            next_pending = parser.find_next_pending_task(track_plan.phases)
            if next_pending is not None:
                phase_num = next_pending[0]
            else:
                first_pending = _find_first_pending_task(track_plan.phases)
                phase_num = (
                    first_pending[0]
                    if first_pending is not None
                    else max(track_plan.phases.keys())
                )
        _require_phase(track_plan, phase_num)
        report_path = (
            parsed.report_path
            if parsed.report_path is not None
            else track_plan.track_dir / f"phase-{phase_num}-review.md"
        )
        review_prompt = templates.generate_turn_prompt(
            track_plan,
            phase_num,
            mode=PromptMode.REVIEW,
            profile=profile,
            cwd=repo_root,
            report_path=report_path,
        ).rstrip("\n")
        _emit_prompt(review_prompt, copy=parsed.copy, label="review")
        return 0

    phase_num, phase_info, resolved_task = _resolve_phase_and_task(
        track_plan,
        phase_num,
        task_num,
        is_checkpoint=bool(parsed.checkpoint),
    )

    if parsed.recovery:
        rec_prompt = templates.generate_turn_prompt(
            track_plan,
            phase_num,
            resolved_task.task_num,
            mode=PromptMode.RECOVERY,
            profile=profile,
            cwd=repo_root,
        ).rstrip("\n")
        _emit_prompt(rec_prompt, copy=parsed.copy, label="recovery")
        return 0

    mode_override: Optional[PromptMode] = None
    if parsed.red:
        mode_override = PromptMode.RED
    elif parsed.green:
        mode_override = PromptMode.GREEN
    elif parsed.checkpoint:
        mode_override = PromptMode.CHECKPOINT

    bp_path = (
        track_plan.track_dir / f"phase-{phase_num}-task-{resolved_task.task_num}-plan.md"
    )
    blueprint = parser.parse_task_blueprint(
        bp_path,
        path_rules=profile.paths,
        task_desc=resolved_task.description,
        subtasks=resolved_task.subtasks,
    )

    computed_strategy = strategy_mod.infer_verification_strategy(
        track_plan,
        phase_num,
        resolved_task.task_num,
        task=resolved_task,
        blueprint=blueprint,
        mode_override=mode_override,
        exempt=resolved_task.exempt,
        profile=profile,
        cwd=repo_root,
    )

    if mode_override in (PromptMode.RED, PromptMode.GREEN) and resolved_task.exempt:
        print(
            f"Warning: Overriding [exempt: {resolved_task.exempt}] classification "
            f"with --{mode_override.value} for Phase {phase_num} Task {resolved_task.task_num}.",
            file=sys.stderr,
        )

    if computed_strategy.is_checkpoint:
        incomplete_prior = [
            f"Task {t.task_num} ('{t.description}')"
            for t in phase_info.tasks
            if t.task_num < resolved_task.task_num
            and t.status not in ("complete", "skipped")
        ]
        if incomplete_prior:
            print(
                f"Warning: Phase {phase_num} still has incomplete prior tasks: "
                f"{', '.join(incomplete_prior)}",
                file=sys.stderr,
            )

    def _render_plan() -> str:
        return templates.generate_turn_prompt(
            track_plan,
            phase_num,
            resolved_task.task_num,
            mode=PromptMode.PLAN,
            profile=profile,
            cwd=repo_root,
            strategy=computed_strategy,
            blueprint=blueprint,
        ).rstrip("\n")

    def _render_exec(mode: PromptMode) -> str:
        return templates.generate_turn_prompt(
            track_plan,
            phase_num,
            resolved_task.task_num,
            mode=mode,
            unattended=parsed.unattended,
            skip_plan=parsed.skip_plan,
            profile=profile,
            cwd=repo_root,
            strategy=computed_strategy,
            blueprint=blueprint,
        ).rstrip("\n")

    if parsed.copy_plan or (parsed.copy and parsed.plan_only):
        _emit_prompt(_render_plan(), copy=True, label="Plan")
        return 0

    if computed_strategy.is_checkpoint and not parsed.plan_only and not parsed.copy_plan:
        ckpt_prompt = _render_exec(PromptMode.CHECKPOINT)
        if parsed.copy or parsed.copy_exec:
            _emit_prompt(ckpt_prompt, copy=True, label="Checkpoint")
            return 0
        if parsed.exec_only:
            print(ckpt_prompt)
            return 0

        _print_box_header(
            f"CONDUCTOR CHECKPOINT: {track_plan.track_name} "
            f"(Phase {phase_num}, Task {resolved_task.task_num})",
            resolved_task.description,
        )
        print(
            "═══════════════════ PHASE CHECKPOINT (WARM OR COLD SESSION) ═══════════════════\n"
        )
        print(ckpt_prompt)
        print(f"\n{_BOX_LINE}\n")
        print(
            "Tip: Use -c / --copy (or --checkpoint -c) to copy directly to your clipboard."
        )
        return 0

    if parsed.copy_exec or (parsed.copy and parsed.exec_only):
        _emit_prompt(_render_exec(computed_strategy.mode), copy=True, label="Exec")
        return 0

    if parsed.plan_only:
        print(_render_plan())
        return 0

    if parsed.exec_only:
        print(_render_exec(computed_strategy.mode))
        return 0

    plan_prompt = _render_plan()
    exec_prompt = _render_exec(computed_strategy.mode)
    _print_box_header(
        f"CONDUCTOR PROMPTS: {track_plan.track_name} "
        f"(Phase {phase_num}, Task {resolved_task.task_num})",
        resolved_task.description,
    )
    print(
        "═══════════════════ PROMPT 1: RESEARCH & PLAN (SESSION 1) ═══════════════════\n"
    )
    print(plan_prompt)
    print(
        "\n═══════════════════ PROMPT 2: IMPLEMENTATION (SESSION 2) ════════════════════\n"
    )
    print(exec_prompt)
    print(f"\n{_BOX_LINE}\n")
    print("Tip: Use --copy-plan or --copy-exec to send directly to your clipboard.")
    return 0


def main(argv: Optional[Sequence[str]] = None) -> int:
    """CLI entrypoint for `conductor-prompt`."""
    arg_parser = build_parser()
    parsed = arg_parser.parse_args(list(argv) if argv is not None else None)
    try:
        return _run_cli(parsed)
    except ConductorError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
