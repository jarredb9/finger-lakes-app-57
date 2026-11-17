"""RepoProfile-driven prompt template builders and in-process turn prompt dispatcher."""

from __future__ import annotations

from pathlib import Path
import re
from typing import Optional, Sequence, Union

from conductor_tools import git_scope, parser, strategy as strategy_mod
from conductor_tools.models import (
    ConductorError,
    PromptMode,
    TaskBlueprint,
    TaskInfo,
    TrackPlan,
    VerificationStrategy,
)
from conductor_tools.profile import PlanningProfile, RepoProfile, load_repo_profile

_ALLOWED_DISPATCH_MODES = frozenset(
    {"plan", "exec", "red", "green", "exempt", "checkpoint", "recovery", "review"}
)
_DEFAULT_NOTE_FIELDS = ("Task", "Summary", "Files", "Rationale")
_DEFAULT_EXEMPT_COMMIT_PREFIXES = ("style(", "chore(", "types(", "docs(")


def _infer_repo_root(track_dir: Path, repo_root: Optional[Path]) -> Path:
    """Return `repo_root` when given, else walk upward from `track_dir` for repo markers."""
    if repo_root is not None:
        return Path(repo_root)
    resolved = Path(track_dir).resolve()
    for directory in (resolved, *resolved.parents):
        if (directory / "conductor").is_dir() or (directory / ".git").exists():
            return directory
    return Path(track_dir)


def _rel_track_dir(track_plan: TrackPlan, repo_root: Path) -> str:
    """Return the track directory path relative to `repo_root` in POSIX format."""
    return git_scope.rel_to_root(track_plan.track_dir, repo_root)


def _resolve_task_info(
    track_plan: TrackPlan,
    phase_num: Optional[int],
    task_num: Optional[int],
    task: Optional[TaskInfo] = None,
) -> Optional[TaskInfo]:
    """Return `task` if provided, else look up `task_num` strictly in `track_plan.phases`."""
    if task is not None:
        return task
    if phase_num is None or task_num is None:
        return None
    phase_info = track_plan.phases.get(phase_num)
    if phase_info is None:
        return None
    return next((t for t in phase_info.tasks if t.task_num == task_num), None)


def _is_nonempty_plan_file(plan_path: Optional[Path]) -> bool:
    """Return True only when `plan_path` exists and contains non-whitespace UTF-8 content."""
    if plan_path is None:
        return False
    try:
        resolved = Path(plan_path)
        if not resolved.is_file():
            return False
        return bool(resolved.read_text(encoding="utf-8").strip())
    except (OSError, UnicodeDecodeError):
        return False


def _format_verification_examples(profile: RepoProfile) -> list[str]:
    """Collect deduplicated verification command examples from `profile`."""
    examples: list[str] = []
    seen: set[str] = set()
    for suite in profile.suites:
        candidate = (suite.targeted_cmd or suite.full_cmd or "").strip()
        if candidate and candidate not in seen:
            seen.add(candidate)
            examples.append(candidate)
    if profile.type_check.cmd and profile.type_check.cmd.strip():
        tc_cmd = profile.type_check.cmd.strip()
        if tc_cmd not in seen:
            seen.add(tc_cmd)
            examples.append(tc_cmd)
    if not examples:
        fallback = profile.supervisor.default_test_cmd.strip() or "<test-command>"
        examples.append(fallback)
    return examples


def _format_note_fields(profile: RepoProfile) -> str:
    """Format configured git-note field names into a comma-separated list."""
    fields = [
        f.rstrip(":").strip()
        for f in profile.supervisor.required_note_fields
        if f.strip()
    ]
    if not fields:
        fields = list(_DEFAULT_NOTE_FIELDS)
    return ", ".join(fields)


def get_preceding_context(
    track_plan: TrackPlan,
    phase_num: Optional[int],
    task_num: Optional[int],
    *,
    repo_root: Optional[Path] = None,
) -> str:
    """Return an immediate preceding task plan reference for progressive disclosure."""
    if phase_num is None or task_num is None or task_num <= 1:
        return ""

    root_dir = _infer_repo_root(track_plan.track_dir, repo_root)
    for prev_k in range(task_num - 1, 0, -1):
        candidate = track_plan.track_dir / f"phase-{phase_num}-task-{prev_k}-plan.md"
        if candidate.is_file():
            rel_p = git_scope.rel_to_root(candidate, root_dir)
            note = f"Immediate Preceding Context: @[{rel_p}]"
            if task_num > 2:
                earlier = ", ".join(
                    f"Task {idx}" for idx in range(1, task_num) if idx != prev_k
                )
                note += f" (earlier completed in Phase {phase_num}: {earlier})"
            return note
    return ""


def has_guardrail_targets(
    track_plan: TrackPlan,
    phase_num: Optional[int],
    task_num: Optional[int],
    *,
    task: Optional[TaskInfo] = None,
    task_desc: str = "",
    subtasks: Sequence[str] = (),
    blueprint: Optional[TaskBlueprint] = None,
    planning: Optional[PlanningProfile] = None,
) -> bool:
    """Return True when a configured style-guide guardrail applies to the task targets."""
    plan_cfg = planning if planning is not None else PlanningProfile()
    if not plan_cfg.style_guide_guardrail or not plan_cfg.style_guide_guardrail.strip():
        return False
    if not plan_cfg.guardrail_extensions:
        return True

    exts = tuple(ext.strip().lower() for ext in plan_cfg.guardrail_extensions if ext.strip())
    if not exts:
        return True

    resolved_task = _resolve_task_info(track_plan, phase_num, task_num, task=task)
    resolved_desc = task_desc or (resolved_task.description if resolved_task is not None else "")
    resolved_subtasks = (
        tuple(subtasks)
        if subtasks
        else (resolved_task.subtasks if resolved_task is not None else ())
    )

    if blueprint is not None:
        resolved_bp = blueprint
    elif phase_num is not None and task_num is not None:
        bp_path = track_plan.track_dir / f"phase-{phase_num}-task-{task_num}-plan.md"
        resolved_bp = parser.parse_task_blueprint(
            bp_path,
            task_desc=resolved_desc,
            subtasks=resolved_subtasks,
        )
    else:
        resolved_bp = TaskBlueprint(plan_path=track_plan.track_dir)

    all_paths = (*resolved_bp.target_files, *resolved_bp.referenced_test_files)
    if any(path.strip().lower().endswith(exts) for path in all_paths):
        return True

    ext_alts = "|".join(re.escape(ext.lstrip(".")) for ext in exts)
    ext_pattern = re.compile(
        rf"(?<![A-Za-z0-9_])[A-Za-z0-9_\-/\.]+\.(?:{ext_alts})(?![A-Za-z0-9_])",
        re.IGNORECASE,
    )
    for text in (*resolved_bp.verification_commands, resolved_desc, *resolved_subtasks):
        if text and ext_pattern.search(text):
            return True
    return False


def build_plan_prompt(
    track_plan: TrackPlan,
    phase_num: Optional[int],
    task_num: Optional[int],
    *,
    task: Optional[TaskInfo] = None,
    task_desc: str = "",
    subtasks: Sequence[str] = (),
    blueprint: Optional[TaskBlueprint] = None,
    strategy: Optional[VerificationStrategy] = None,
    profile: Optional[RepoProfile] = None,
    repo_root: Optional[Path] = None,
) -> str:
    """Build a headless Tier 1 planning prompt for a checkpoint or standard task."""
    prof = profile if profile is not None else RepoProfile()
    work_dir = _infer_repo_root(track_plan.track_dir, repo_root)
    rel_track_dir = _rel_track_dir(track_plan, work_dir)
    resolved_task = _resolve_task_info(track_plan, phase_num, task_num, task=task)
    resolved_desc = task_desc or (resolved_task.description if resolved_task is not None else "")
    resolved_subtasks = (
        tuple(subtasks)
        if subtasks
        else (resolved_task.subtasks if resolved_task is not None else ())
    )

    plan_file = f"{rel_track_dir}/phase-{phase_num}-task-{task_num}-plan.md"
    task_focus = f" for '{resolved_desc}'" if resolved_desc else ""
    context_hint = get_preceding_context(
        track_plan, phase_num, task_num, repo_root=work_dir
    )
    context_line = f"\n\n{context_hint}" if context_hint else ""

    resolved_strategy = (
        strategy
        if strategy is not None
        else strategy_mod.infer_verification_strategy(
            track_plan,
            phase_num,
            task_num,
            task=resolved_task,
            task_desc=resolved_desc,
            subtasks=resolved_subtasks,
            blueprint=blueprint,
            profile=prof,
            cwd=work_dir,
        )
    )

    examples = _format_verification_examples(prof)
    examples_str = " or ".join(examples)
    note_fields = _format_note_fields(prof)

    if resolved_strategy.is_checkpoint:
        domain_prompts = [
            f"{name}: {rule.manual_verification_prompt}"
            for name, rule in sorted(
                prof.domains.items(), key=lambda kv: kv[1].priority, reverse=True
            )
            if rule.manual_verification_prompt
        ]
        manual_guidance = (
            "; ".join(domain_prompts)
            if domain_prompts
            else (
                "Actionable step-by-step verification plan for the user "
                "(CLI, invariant, or domain-specific spot-checks)"
            )
        )
        return (
            f"Plan Phase {phase_num} Task {task_num} only{task_focus} for @[{rel_track_dir}] "
            f"using @[{rel_track_dir}/spec.md] and @[{rel_track_dir}/plan.md].{context_line}\n\n"
            f"Gate & Planning Protocol (Phase Completion Verification & Checkpointing):\n"
            f"- Reference the Phase Completion Verification and Checkpointing Protocol in conductor/workflow.md.\n"
            f"- Perform static code inspection focused on the phase scope (no test runs or builds during planning).\n"
            f"- Write the verification plan directly to: {plan_file}\n"
            f"- Plan Blueprint Requirements:\n"
            f"  1. Scope Inspection: Define the git diff range since previous phase checkpoint "
            f"(`git diff --name-only <prev_sha> HEAD`) and list all changed code files.\n"
            f"  2. Test Coverage Audit: Verify all modified code files have corresponding test files; "
            f"specify any missing tests to generate.\n"
            f"  3. Automated Verification Commands: Phase-scoped verification commands ({examples_str}).\n"
            f"  4. Manual Verification Steps: {manual_guidance}.\n"
            f"  5. Post-Execution Protocol: Define checkpoint commit `conductor(checkpoint): Checkpoint end of Phase {phase_num}`, "
            f"git notes report format, and plan.md update with `[checkpoint: <sha>]`.\n"
            f"- Headless --print mode: do NOT invoke ask_question or interactive modals. "
            f"Terminate your turn immediately after writing {plan_file}."
        )

    apply_guardrail = has_guardrail_targets(
        track_plan,
        phase_num,
        task_num,
        task=resolved_task,
        task_desc=resolved_desc,
        subtasks=resolved_subtasks,
        blueprint=blueprint,
        planning=prof.planning,
    )
    guardrail_line = (
        f"\n- {prof.planning.style_guide_guardrail}"
        if apply_guardrail and prof.planning.style_guide_guardrail
        else ""
    )

    return (
        f"Plan Phase {phase_num} Task {task_num} only{task_focus} for @[{rel_track_dir}] "
        f"using @[{rel_track_dir}/spec.md] and @[{rel_track_dir}/plan.md].{context_line}\n\n"
        f"Gate & Planning Protocol:\n"
        f"- Perform static code inspection focused on the target seam (no test runs or builds during planning).\n"
        f"- Write the implementation plan directly to: {plan_file}\n"
        f"- Plan Blueprint Requirements:\n"
        f"  1. Exact target file paths (format as `- **Path:** `filepath``) and semantic insertion anchors.\n"
        f"  2. Full interfaces, types, and exported signatures.\n"
        f"  3. Precise behavioral logic (formulas, state transitions, conditions, error handling, edge cases).\n"
        f"  4. Execution Verification Protocol with exact test commands to run (e.g. {examples_str}). "
        f"Format bash verification commands as single-line or '&&'-chained commands "
        f"(optional leading KEY=VALUE env vars or 'cd <repo-subdir>' allowed; "
        f"do not use pipes '|', redirections '>', '<', ';', '||', 'export', '$(...)', or backticks).\n"
        f"  Omit verbatim multi-page code implementations; the executor will synthesize code directly "
        f"using the blueprint with compiler and test feedback.{guardrail_line}\n"
        f"- In the plan's Post-Execution section, format the `git notes add` command using the standard fields: "
        f"{note_fields}.\n"
        f"- Headless --print mode: do NOT invoke ask_question or interactive modals. "
        f"Terminate your turn immediately after writing {plan_file}."
    )


def build_checkpoint_prompt(
    track_plan: TrackPlan,
    phase_num: Optional[int],
    task_num: Optional[int],
    *,
    task_desc: str = "",
    strategy: Optional[VerificationStrategy] = None,
    profile: Optional[RepoProfile] = None,
    unattended: bool = False,
    repo_root: Optional[Path] = None,
) -> str:
    """Build a self-contained, diff-gated Phase Checkpoint prompt."""
    prof = profile if profile is not None else RepoProfile()
    work_dir = _infer_repo_root(track_plan.track_dir, repo_root)
    rel_track_dir = _rel_track_dir(track_plan, work_dir)
    plan_file = f"{rel_track_dir}/phase-{phase_num}-task-{task_num}-plan.md"

    if strategy is not None:
        resolved_strategy = strategy
        ctx = (
            strategy.checkpoint_context
            if strategy.checkpoint_context is not None
            else strategy_mod.collect_phase_checkpoint_context(
                track_plan, phase_num, task_num, profile=prof, cwd=work_dir
            )
        )
    else:
        resolved_strategy = strategy_mod.infer_verification_strategy(
            track_plan,
            phase_num,
            task_num,
            task_desc=task_desc,
            mode_override=PromptMode.CHECKPOINT,
            profile=prof,
            cwd=work_dir,
        )
        ctx = (
            resolved_strategy.checkpoint_context
            if resolved_strategy.checkpoint_context is not None
            else strategy_mod.collect_phase_checkpoint_context(
                track_plan, phase_num, task_num, profile=prof, cwd=work_dir
            )
        )

    clean_phase_name = ctx.clean_phase_name or f"Phase {phase_num}"
    raw_heading = ctx.raw_heading or f"## Phase {phase_num}: {clean_phase_name}"
    baseline_sha = ctx.baseline_sha
    end_sha = ctx.end_sha or "HEAD"
    changed_files = ctx.changed_files
    domain = ctx.domain or "backend_tooling"
    has_checkpoint_plan = ctx.has_checkpoint_plan

    plan_ref_clause = f" and @[{plan_file}]" if has_checkpoint_plan else ""
    range_line = (
        f"- Git range: `{baseline_sha}..{end_sha}`"
        if baseline_sha
        else "- Git range: current phase commits (`git status --short`)"
    )
    if changed_files:
        files_block = "\n".join(f"  - `{f}`" for f in changed_files[:20])
    else:
        files_block = "  - *(No code file diffs detected yet; inspect `git status --short`)*"

    commands = resolved_strategy.commands or ctx.commands
    cmd_lines = (
        "\n".join(f"     {c}" for c in commands)
        if commands
        else f"     {prof.supervisor.default_test_cmd}"
    )
    diff_check_cmd = (
        f"`git diff --name-only {baseline_sha} {end_sha}` and `git status --short`"
        if baseline_sha
        else "`git status --short`"
    )

    domain_rule = prof.domains.get(domain)
    if domain_rule is not None and domain_rule.manual_verification_prompt:
        manual_directive = domain_rule.manual_verification_prompt
    else:
        manual_directive = (
            "Domain Verification Summary: Present a concise verification summary "
            "with 1-3 targeted CLI, test, or invariant spot-checks."
        )

    resolved_task = _resolve_task_info(track_plan, phase_num, task_num)
    effective_task_desc = (
        task_desc
        or (resolved_task.description if resolved_task is not None and resolved_task.description else "")
        or f"Conductor - User Manual Verification 'Phase {phase_num}: {clean_phase_name}' (Protocol in workflow.md)"
    )

    if unattended:
        sec3_heading = "3. Domain-Aware Manual Verification (Unattended Execution Mode):"
        sec3_content = (
            "   - Automated test suites are authoritative for phase closure in unattended runs.\n"
            f"   - {manual_directive}\n"
            "   - Do NOT pause for user input or prompt via interactive dialogs; "
            "record the verification steps and observations directly into the git notes below."
        )
        sec4_heading = "4. Verbatim Phase Closure (Unattended Mode):"
        confirmation_line = "User Confirmation: Unattended execution mode (deferred manual verification)."
    else:
        sec3_heading = "3. Domain-Aware Manual Verification & User Confirmation Gate:"
        sec3_content = (
            f"   - {manual_directive}\n"
            "   - Pause via `ask_question` for explicit user approval "
            "(`AGENTS.md` Guardrail #5: `User Skipped` or dismissal is strictly non-affirmative — "
            "halt immediately without committing)."
        )
        sec4_heading = "4. Verbatim Phase Closure (Execute ONLY After Explicit Affirmative Approval):"
        confirmation_line = "User Confirmation: Explicitly approved via interactive modal."

    return (
        f"Execute Phase {phase_num} Checkpoint (Task {task_num}) for "
        f"'Phase {phase_num}: {clean_phase_name}' in @[{rel_track_dir}]{plan_ref_clause}.\n\n"
        f"Pre-Computed Phase Scope:\n"
        f"{range_line}\n"
        f"- Phase touched / targeted files:\n"
        f"{files_block}\n\n"
        f"Checkpoint Execution Directives (Self-Contained — Zero Extra Doc Reads):\n"
        f"1. Zero-Overhead Scope & Coverage Audit:\n"
        f"   - Do NOT read `conductor/workflow.md`, `product.md`, or `product-guidelines.md`; "
        f"this prompt contains the complete checkpoint protocol.\n"
        f"   - Run {diff_check_cmd} to confirm working tree cleanliness and verify all modified code files "
        f"in Phase {phase_num} have corresponding test coverage.\n"
        f"2. Diff-Gated Automated Verification (Warm & Cold Session Safe):\n"
        f"   - **Warm-Session Fast Path:** If this session ALREADY executed and passed verification covering all "
        f"changed files in Phase {phase_num}, AND zero non-`conductor/` code, SQL, or config files were modified "
        f"after that passing test run (including during any intervening refactor/cleanup task or uncommitted edits), "
        f"**SKIP re-running test suites** and cite the passing commands and results from earlier in this session.\n"
        f"   - **Cold-Session / Post-Edit Fallback:** If running in a fresh session OR any non-`conductor/` file "
        f"changed after the last passing test run, execute ONLY these phase-scoped verification commands:\n"
        f"{cmd_lines}\n"
        f"{sec3_heading}\n"
        f"{sec3_content}\n"
        f"{sec4_heading}\n"
        f"   - Create empty checkpoint commit:\n"
        f'     `git commit --allow-empty -m "conductor(checkpoint): Checkpoint end of Phase {phase_num}"`\n'
        f"   - Capture `<full_sha>` (`git rev-parse HEAD`) and `<short_sha>` (`git rev-parse --short HEAD`), "
        f"then attach verification git note:\n"
        f'     `git notes add -m "Phase: Phase {phase_num}: {clean_phase_name}\\nAutomated Tests:\\n'
        f'<commands & results>\\nManual Verification:\\n<summary>\\n{confirmation_line}" <full_sha>`\n'
        f"   - Update `{rel_track_dir}/plan.md` in a single edit:\n"
        f"     a. Append `[checkpoint: <short_sha>]` to heading `{raw_heading}` -> `{raw_heading} [checkpoint: <short_sha>]`\n"
        f"     b. Mark Task {task_num} complete: `- [x] Task: {effective_task_desc} [commit: <short_sha>]`\n"
        f"   - Commit plan update:\n"
        f'     `git add {rel_track_dir}/plan.md && git commit -m "conductor(plan): Mark phase \'Phase {phase_num}: {clean_phase_name}\' as complete"`\n'
        f"5. Output a brief completion summary and halt."
    )


def build_exec_prompt(
    track_plan: TrackPlan,
    phase_num: Optional[int],
    task_num: Optional[int],
    *,
    task: Optional[TaskInfo] = None,
    task_desc: str = "",
    subtasks: Sequence[str] = (),
    blueprint: Optional[TaskBlueprint] = None,
    strategy: Optional[VerificationStrategy] = None,
    mode_override: Optional[PromptMode] = None,
    exempt: Optional[str] = None,
    profile: Optional[RepoProfile] = None,
    unattended: bool = False,
    skip_plan: bool = False,
    repo_root: Optional[Path] = None,
) -> str:
    """Build the Tier 2 execution prompt across Red, Green, Exempt, and Checkpoint modes."""
    prof = profile if profile is not None else RepoProfile()
    work_dir = _infer_repo_root(track_plan.track_dir, repo_root)
    rel_track_dir = _rel_track_dir(track_plan, work_dir)
    resolved_task = _resolve_task_info(track_plan, phase_num, task_num, task=task)
    resolved_desc = task_desc or (resolved_task.description if resolved_task is not None else "")
    resolved_subtasks = (
        tuple(subtasks)
        if subtasks
        else (resolved_task.subtasks if resolved_task is not None else ())
    )

    plan_path = (
        track_plan.track_dir / f"phase-{phase_num}-task-{task_num}-plan.md"
        if phase_num is not None and task_num is not None
        else None
    )
    plan_file = f"{rel_track_dir}/phase-{phase_num}-task-{task_num}-plan.md"

    if blueprint is not None:
        resolved_bp = blueprint
    elif plan_path is not None and plan_path.is_file():
        resolved_bp = parser.parse_task_blueprint(
            plan_path,
            path_rules=prof.paths,
            task_desc=resolved_desc,
            subtasks=resolved_subtasks,
        )
    else:
        resolved_bp = TaskBlueprint(
            plan_path=plan_path if plan_path is not None else track_plan.track_dir
        )

    resolved_strategy = (
        strategy
        if strategy is not None
        else strategy_mod.infer_verification_strategy(
            track_plan,
            phase_num,
            task_num,
            task=resolved_task,
            task_desc=resolved_desc,
            subtasks=resolved_subtasks,
            blueprint=resolved_bp,
            mode_override=mode_override,
            exempt=exempt,
            profile=prof,
            cwd=work_dir,
        )
    )

    if resolved_strategy.mode == PromptMode.CHECKPOINT:
        return build_checkpoint_prompt(
            track_plan,
            phase_num,
            task_num,
            task_desc=resolved_desc,
            strategy=resolved_strategy,
            profile=prof,
            unattended=unattended,
            repo_root=work_dir,
        )

    has_plan_file = _is_nonempty_plan_file(plan_path)
    is_docs_exempt = (
        resolved_strategy.mode == PromptMode.EXEMPT
        and (resolved_strategy.exempt or "").strip().lower() == "docs"
    )
    use_inline_blueprint = (not has_plan_file) and (is_docs_exempt or skip_plan)

    exempt_prefixes = tuple(
        dict.fromkeys(
            (
                *(
                    f"{rule.commit_prefix}("
                    for rule in prof.exempt.values()
                    if rule.commit_prefix
                ),
                *_DEFAULT_EXEMPT_COMMIT_PREFIXES,
            )
        )
    )
    if resolved_strategy.mode == PromptMode.EXEMPT:
        if resolved_bp.post_exec_commit_msg and any(
            resolved_bp.post_exec_commit_msg.startswith(prefix)
            for prefix in exempt_prefixes
        ):
            commit_msg = resolved_bp.post_exec_commit_msg
        else:
            commit_msg = resolved_strategy.commit_msg
    else:
        commit_msg = resolved_bp.post_exec_commit_msg or resolved_strategy.commit_msg
    commit_msg = commit_msg.replace("`", "")

    cmd_lines = "\n".join(f"     {cmd}" for cmd in resolved_strategy.commands)
    if resolved_strategy.mode == PromptMode.EXEMPT:
        cat_suffix = f": {resolved_strategy.exempt}" if resolved_strategy.exempt else ""
        if resolved_strategy.commands:
            check_body = f"   - Run category-specific verification check:\n{cmd_lines}"
        else:
            fallback_instr = (
                resolved_strategy.instruction.strip()
                or "- Verify exempt task changes cleanly."
            )
            if not fallback_instr.startswith("-"):
                fallback_instr = f"- {fallback_instr}"
            check_body = f"   {fallback_instr}"
        verification_block = (
            f"2. Targeted Verification (Exempt{cat_suffix}):\n"
            f"{check_body}\n"
            f"   - Confirm verification check passes cleanly before committing."
        )
    elif resolved_strategy.mode == PromptMode.RED:
        red_cmds = cmd_lines or f"     {prof.supervisor.default_test_cmd}"
        verification_block = (
            "2. Targeted Verification (Red Phase):\n"
            "   - Run test runner to confirm new tests fail with expected assertions:\n"
            f"{red_cmds}\n"
            "   - Verify failure matches expectations. Do not implement production code in this task."
        )
    else:
        green_cmds = cmd_lines or f"     {prof.supervisor.default_test_cmd}"
        verification_block = (
            "2. Targeted Verification (Green Phase):\n"
            "   - Run targeted test runner and type check (where configured) for created/modified files:\n"
            f"{green_cmds}\n"
            "   - If tests fail, diagnose within the target seam, adjust implementation or fixtures, and re-verify until green."
        )

    note_fields = _format_note_fields(prof)
    empty_commit_line = ""
    if resolved_strategy.mode == PromptMode.EXEMPT and not is_docs_exempt:
        empty_commit_line = (
            "\n   - If a verification-only exempt task produced zero file modifications, "
            'use `git commit --allow-empty -m "..."` so the commit SHA, Git notes, and `plan.md` audit trail remain intact.'
        )

    commit_and_plan_suffix = (
        f'commit changes with message "{commit_msg}", record git notes ({note_fields}), '
        f"mark task as complete [x] with appended [commit: <hash>] in {rel_track_dir}/plan.md, "
        f"and commit plan.md.{empty_commit_line}"
    )

    if use_inline_blueprint:
        header_line = (
            f"Execute Phase {phase_num} Task {task_num} following "
            f"@[{rel_track_dir}/plan.md] and @[{rel_track_dir}/spec.md]."
        )
        subtasks_block = ""
        if resolved_subtasks:
            subtasks_lines = "\n".join(f"     - {st}" for st in resolved_subtasks)
            subtasks_block = f"\n   - Subtasks:\n{subtasks_lines}"
        scope_block = (
            f"1. Scope & Blueprint: Direct execution mode (Tier 1 task plan skipped). "
            f"@[{rel_track_dir}/plan.md] and @[{rel_track_dir}/spec.md] are authoritative.\n"
            f"   - Task: {resolved_desc or f'Phase {phase_num} Task {task_num}'}"
            f"{subtasks_block}"
        )
        post_exec_line = f"   - Execute post-execution steps: {commit_and_plan_suffix}"
    else:
        header_line = f"Execute Phase {phase_num} Task {task_num} following @[{plan_file}]."
        scope_block = (
            f"1. Scope & Blueprint: The plan blueprint in @[{plan_file}] is authoritative. "
            f"Modify only the planned target files. You may read adjacent files or type definitions "
            f"as needed to resolve imports, types, or test fixtures."
        )
        if resolved_bp.post_exec_section:
            post_exec_directive = f"Follow {resolved_bp.post_exec_section} of @[{plan_file}]."
        else:
            post_exec_directive = f"Follow the Post-Execution section of @[{plan_file}] if present."
        post_exec_line = f"   - {post_exec_directive} Otherwise: {commit_and_plan_suffix}"

    guardrail_block = ""
    if prof.planning.style_guide_guardrail and has_guardrail_targets(
        track_plan,
        phase_num,
        task_num,
        task=resolved_task,
        task_desc=resolved_desc,
        subtasks=resolved_subtasks,
        blueprint=resolved_bp,
        planning=prof.planning,
    ):
        guardrail_block = f"\n   - {prof.planning.style_guide_guardrail}"

    return (
        f"{header_line}\n\n"
        f"Execution Directives:\n"
        f"{scope_block}{guardrail_block}\n"
        f"{verification_block}\n"
        f"3. Post-Execution:\n"
        f"{post_exec_line}\n"
        f"4. Output a brief completion summary and halt."
    )


def build_recovery_prompt(
    track_plan: TrackPlan,
    phase_num: Optional[int],
    task_num: Optional[int],
    *,
    profile: Optional[RepoProfile] = None,
    repo_root: Optional[Path] = None,
    failure_context: Optional[str] = None,
) -> str:
    """Build a headless recovery prompt to verify and commit uncommitted task work."""
    prof = profile if profile is not None else RepoProfile()
    work_dir = _infer_repo_root(track_plan.track_dir, repo_root)
    rel_track_dir = _rel_track_dir(track_plan, work_dir)
    note_fields = _format_note_fields(prof)

    prompt = (
        f"Recover uncommitted changes in @[{rel_track_dir}] for Phase {phase_num}, Task {task_num}.\n\n"
        f"Headless --print mode: do NOT invoke ask_question or interactive modals.\n"
        f"Inspect `git status` and `git diff`, verify changes with the task's tests, "
        f"commit using Conventional Commits with git notes ({note_fields}), "
        f"update {rel_track_dir}/plan.md, commit plan.md, and halt."
    )
    if failure_context and failure_context.strip():
        prompt += (
            "\n\n## Post-Turn Verification / Audit Failure (Bounded Repair)\n"
            f"{failure_context.strip()}"
        )
    return prompt


def build_review_prompt(
    track_name: Union[str, TrackPlan],
    phase_num: int,
    report_path: Path,
) -> str:
    """Build an unattended Gate 2 `/conductor:review` prompt scoped to a track phase."""
    resolved_name = (
        track_name.track_name if isinstance(track_name, TrackPlan) else str(track_name)
    )
    return (
        f"/conductor:review {resolved_name}\n\n"
        f"UNATTENDED / NON-INTERACTIVE REVIEW OVERRIDES:\n"
        f"- Scope strictly to track `{resolved_name}`, Phase {phase_num}. "
        f"Auto-confirm scope without any `ask_question` modal pauses.\n"
        f"- If the phase diff exceeds 300 lines, automatically accept Iterative Review Mode "
        f"without pausing for confirmation.\n"
        f"- Write the full structured markdown review report to `{report_path}`.\n"
        f"- Preserve canonical finding severity headings "
        f"(`### [Critical]`, `### [High]`, `### [Medium]`, `### [Low]`).\n"
        f"- Halt cleanly after saving `{report_path}`. "
        f"Do NOT auto-apply fixes and do NOT prompt interactively at Section 3.1.\n"
    )


def generate_turn_prompt(
    track: Union[str, TrackPlan],
    phase_num: Optional[int],
    task_num: Optional[int] = None,
    mode: Union[PromptMode, str] = PromptMode.PLAN,
    *,
    unattended: bool = False,
    skip_plan: bool = False,
    profile: Optional[RepoProfile] = None,
    cwd: Optional[Path] = None,
    strategy: Optional[VerificationStrategy] = None,
    blueprint: Optional[TaskBlueprint] = None,
    report_path: Optional[Path] = None,
    failure_context: Optional[str] = None,
) -> str:
    """Dispatch and render a Conductor prompt in-process without subprocesses or `importlib`."""
    raw_mode = (
        mode.value
        if isinstance(mode, PromptMode)
        else str(mode).strip().lstrip("-").lower()
    )
    if raw_mode not in _ALLOWED_DISPATCH_MODES:
        raise ConductorError(f"Unsupported prompt mode: {mode!r}")

    if isinstance(track, TrackPlan):
        work_dir = Path(cwd) if cwd is not None else _infer_repo_root(track.track_dir, None)
        prof = profile if profile is not None else load_repo_profile(repo_root=work_dir)
        track_plan = track
    else:
        work_dir = Path(cwd) if cwd is not None else git_scope.resolve_repo_root()
        prof = profile if profile is not None else load_repo_profile(repo_root=work_dir)
        track_dir = git_scope.resolve_track_dir(track, work_dir, planning=prof.planning)
        if track_dir is None or not (track_dir / "plan.md").is_file():
            raise ConductorError(f"Track plan not found for {track!r} in '{work_dir}'")
        track_plan = parser.parse_track_plan(track_dir)

    if raw_mode == "review":
        if phase_num is None:
            raise ConductorError("phase_num is required for review mode")
        resolved_report = (
            report_path
            if report_path is not None
            else track_plan.track_dir / f"phase-{phase_num}-review.md"
        )
        return build_review_prompt(track_plan, phase_num, resolved_report)

    if phase_num is None or phase_num not in track_plan.phases:
        raise ConductorError(
            f"Phase {phase_num!r} not found in track '{track_plan.track_name}'"
        )
    phase_info = track_plan.phases[phase_num]

    if raw_mode == "checkpoint":
        if task_num is None:
            ckpt_task = next((t for t in phase_info.tasks if t.is_checkpoint), None)
            if ckpt_task is None:
                raise ConductorError(
                    f"No checkpoint task found in Phase {phase_num} of '{track_plan.track_name}'"
                )
            resolved_task_obj = ckpt_task
            resolved_task_num = ckpt_task.task_num
        else:
            resolved_task_obj = _resolve_task_info(track_plan, phase_num, task_num)
            if resolved_task_obj is None:
                raise ConductorError(
                    f"Task {task_num} not found in Phase {phase_num} of '{track_plan.track_name}'"
                )
            resolved_task_num = task_num
        return build_checkpoint_prompt(
            track_plan,
            phase_num,
            resolved_task_num,
            task_desc=resolved_task_obj.description,
            strategy=strategy,
            profile=prof,
            unattended=unattended,
            repo_root=work_dir,
        )

    if task_num is None:
        raise ConductorError(f"task_num is required for mode {raw_mode!r}")
    resolved_task_obj = _resolve_task_info(track_plan, phase_num, task_num)
    if resolved_task_obj is None:
        raise ConductorError(
            f"Task {task_num} not found in Phase {phase_num} of '{track_plan.track_name}'"
        )

    if raw_mode == "plan":
        return build_plan_prompt(
            track_plan,
            phase_num,
            task_num,
            task=resolved_task_obj,
            blueprint=blueprint,
            strategy=strategy,
            profile=prof,
            repo_root=work_dir,
        )

    if raw_mode == "recovery":
        return build_recovery_prompt(
            track_plan,
            phase_num,
            task_num,
            profile=prof,
            repo_root=work_dir,
            failure_context=failure_context,
        )

    mode_override = (
        PromptMode(raw_mode) if raw_mode in ("red", "green", "exempt") else None
    )
    return build_exec_prompt(
        track_plan,
        phase_num,
        task_num,
        task=resolved_task_obj,
        blueprint=blueprint,
        strategy=strategy,
        mode_override=mode_override,
        profile=prof,
        unattended=unattended,
        skip_plan=skip_plan,
        repo_root=work_dir,
    )


__all__ = [
    "build_checkpoint_prompt",
    "build_exec_prompt",
    "build_plan_prompt",
    "build_recovery_prompt",
    "build_review_prompt",
    "generate_turn_prompt",
    "get_preceding_context",
    "has_guardrail_targets",
]
