# Implementation Plan: Portable `conductor-tools` Package & `RepoProfile` Seam (Issue #110)

## Phase 1: Package Scaffolding, Core Models, `RepoProfile`, Parser & Git Scope
- [ ] Task: Scaffold `scripts/conductor-tools/pyproject.toml` and `conductor_tools/__init__.py` package skeleton (`requires-python >= 3.11`, zero dependencies, console scripts `conductor-prompt` and `conductor-auto`) [exempt: infra]
    - [ ] Create `scripts/conductor-tools/pyproject.toml` with `setuptools.build_meta`, `requires-python = ">=3.11"`, zero runtime dependencies, and `[project.scripts]` entries
    - [ ] Create `scripts/conductor-tools/conductor_tools/__init__.py` and `scripts/conductor-tools/tests/__init__.py`
- [ ] Task: Write failing unit tests for `models.py` and `profile.py` (TDD Red phase)
    - [ ] Create `scripts/conductor-tools/tests/test_models.py` testing frozen `slots=True` dataclasses (`PromptMode`, `TaskInfo`, `PhaseInfo`, `TrackPlan`, `TaskBlueprint`, `PhaseCheckpointContext`, `VerificationStrategy`, `TurnStreamConfig`, `ReviewResult`) and `ConductorError` exception hierarchy (`PlanInvariantError`, `ProcessExecutionError`, `SupervisorInvariantError`, `GitTreeDirtyError`)
    - [ ] Create `scripts/conductor-tools/tests/test_profile.py` testing generic built-in `RepoProfile` defaults (zero Finger Lakes paths, generic `PathRules`, `docs`/`infra`/`scripts` exempt rules, generic verification tokens), `load_repo_profile` `tomllib` parsing, replace-on-key merging, and strict schema validation raising `ConductorError` on unknown sections/keys or invalid types
    - [ ] Run `python3.12 -m unittest discover -s scripts/conductor-tools/tests -t scripts/conductor-tools -p "test_models.py"` and `test_profile.py` and confirm expected failures
- [ ] Task: Implement `models.py`, `profile.py`, and Finger Lakes `conductor/profile.toml` (TDD Green phase)
    - [ ] Implement `scripts/conductor-tools/conductor_tools/models.py` with frozen `slots=True` dataclasses and exception hierarchy
    - [ ] Implement `scripts/conductor-tools/conductor_tools/profile.py` with generic built-in defaults, `tomllib` loader, replace-on-key merging, and strict validation
    - [ ] Author `conductor/profile.toml` capturing Finger Lakes suites (`integration`, `unit`, `e2e`, `edge_functions`, `python_agent`), domain rules (`ui`, `database`, `backend_tooling`), exempt rules (`ui`, `styling`, `infra`, `scripts`, `types`, `docs`), paths, supervisor (`static_analysis_prefixes`, `default_test_cmd`, `full_suite_keywords`), safety patterns, and model defaults
    - [ ] Run `test_models.py` and `test_profile.py` and confirm all tests pass
- [ ] Task: Write failing unit tests for `parser.py` and `git_scope.py` (TDD Red phase)
    - [ ] Create `scripts/conductor-tools/tests/test_parser.py` testing `tracks.md` registry parsing, `plan.md` `PhaseInfo`/`TaskInfo` parsing (`Review Fixes`, `[exempt: <category>]`, `[-]` skipped, SHAs, without `.to_dict()` bridges), `TaskBlueprint` separation of `target_files` vs `referenced_test_files` via `PathRules`, full backtick command extraction (`=` / flags / `&&`), post-exec commit extraction, and `phase-N-review.md` severity parsing
    - [ ] Create `scripts/conductor-tools/tests/test_git_scope.py` testing `resolve_repo_root` (`-C`/`--repo-root` fast-fail when invalid/missing `conductor/`, `cwd` walk stopping at `.git` boundaries, script-path fallback only when `cwd` is outside any `.git` repo), track root discovery, baseline/end SHA resolution, git diff/status helpers, commit/notes auditing, and `copy_to_clipboard` (`stdout=DEVNULL` + timeout)
    - [ ] Run `test_parser.py` and `test_git_scope.py` and confirm expected failures
- [ ] Task: Implement `parser.py` and `git_scope.py` (TDD Green phase)
    - [ ] Implement `scripts/conductor-tools/conductor_tools/parser.py` absorbing `plan_parser.py` without `.to_dict()` bridges and separating `TaskBlueprint.target_files` / `referenced_test_files` via `PathRules`
    - [ ] Implement `scripts/conductor-tools/conductor_tools/git_scope.py` with git-boundary-guarded `resolve_repo_root`, git inspection/audit adapters, and `copy_to_clipboard` (`stdout=DEVNULL` + timeout)
    - [ ] Run `python3.12 -m unittest discover -s scripts/conductor-tools/tests -t scripts/conductor-tools` and confirm all Phase 1 tests pass
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Package Scaffolding, Core Models, RepoProfile, Parser & Git Scope' (Protocol in workflow.md)

## Phase 2: Single-Pass Strategy Engine, Prompt Templates & `conductor-prompt` CLI
- [ ] Task: Write failing unit tests for `strategy.py` (TDD Red phase)
    - [ ] Create `scripts/conductor-tools/tests/test_strategy.py` testing unified `classify_task_mode()` (including `startswith("test(")`), fast-fail `ConductorError` on undeclared `[exempt: <category>]`, Red-mode stripping of `[supervisor].static_analysis_prefixes`, ordered all-matching `[[suites]]` loop with `shlex.quote`-escaped `{files}`, `[type_check].extensions` gating, `full_suite_keywords` handling, single-pass `VerificationStrategy` inference, `PhaseCheckpointContext` collection (excluding `referenced_test_files`), and idempotent command filtering
    - [ ] Run `test_strategy.py` and confirm expected failures
- [ ] Task: Implement `strategy.py` (TDD Green phase)
    - [ ] Implement `scripts/conductor-tools/conductor_tools/strategy.py` with unified classification, fail-fast undeclared exempt handling, Red static-analysis stripping, data-driven `[[suites]]` loop, `[type_check]` extension gating, and single-pass `VerificationStrategy` computation
    - [ ] Run `test_strategy.py` and confirm all tests pass
- [ ] Task: Write failing unit tests for `templates.py` and `prompt_cli.py` (TDD Red phase)
    - [ ] Create `scripts/conductor-tools/tests/test_templates.py` testing Plan, Red, Green, Exempt, Checkpoint (interactive & `--unattended`), Recovery, and Gate 2 Review prompt rendering plus `generate_turn_prompt()` in-process helper and removal of composite TDD branch
    - [ ] Create `scripts/conductor-tools/tests/test_prompt_cli.py` testing `conductor-prompt` CLI flags (`-C`/`--repo-root`, `--plan`, `--exec`, `--checkpoint`, `--unattended`, `--recovery`, `--review` with optional `[track] [phase]` and `--report-path`, `--copy`), explicit `--red`/`--green` overrides (warning on `[exempt]`, error on checkpoint), rejection of removed `--full` flag, single-pass strategy execution, and synthetic-repo execution without `conductor/profile.toml`
    - [ ] Run `test_templates.py` and `test_prompt_cli.py` and confirm expected failures
- [ ] Task: Implement `templates.py` and `prompt_cli.py` (TDD Green phase)
    - [ ] Implement `scripts/conductor-tools/conductor_tools/templates.py` with pure Python prompt builders (including `build_review_prompt`) driven by `RepoProfile` and in-process `generate_turn_prompt()`
    - [ ] Implement `scripts/conductor-tools/conductor_tools/prompt_cli.py` supporting `-C`/`--repo-root`, `--review`, mode overrides, and all prompt modes (without `--full`)
    - [ ] Run `python3.12 -m unittest discover -s scripts/conductor-tools/tests -t scripts/conductor-tools` and confirm all Phase 2 tests pass
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Single-Pass Strategy Engine, Prompt Templates & conductor-prompt CLI' (Protocol in workflow.md)

## Phase 3: Streaming Telemetry, Process Adapter, Supervisor Gates & `conductor-auto` CLI
- [ ] Task: Write failing unit tests for `streaming.py` and `process.py` (TDD Red phase)
    - [ ] Create `scripts/conductor-tools/tests/test_streaming.py` testing `DualLogger`, `_StreamJsonTracker`, `_TurnOutputSink`, NDJSON `conversation_id` extraction, and brain directory snapshotting with `CONDUCTOR_BRAIN_DIR` override
    - [ ] Create `scripts/conductor-tools/tests/test_process.py` testing `build_agy_command` flag ordering, `run_agy_turn`, `_drain_stdout_select`, removal of dead `proc.stdin.write` path, process-group SIGTERM/SIGKILL termination, `parse_timeout`, and 4-tier `resolve_model_config` (`--<role>-model` > `CONDUCTOR_<ROLE>_MODEL` > `--model-family`/`CONDUCTOR_MODEL_FAMILY` + `efforts` > `profile.models`)
    - [ ] Run `test_streaming.py` and `test_process.py` and confirm expected failures
- [ ] Task: Implement `streaming.py` and `process.py` (TDD Green phase)
    - [ ] Implement `scripts/conductor-tools/conductor_tools/streaming.py` with configurable `brain_dir`
    - [ ] Implement `scripts/conductor-tools/conductor_tools/process.py` without dead `proc.stdin.write` code and with 4-tier `resolve_model_config`
    - [ ] Run `test_streaming.py` and `test_process.py` and confirm all tests pass
- [ ] Task: Write failing unit tests for `supervisor.py` (TDD Red phase)
    - [ ] Create `scripts/conductor-tools/tests/test_supervisor.py` testing `check_plan_cache` and `assert_post_plan_invariants` (rejecting whitespace-only/empty blueprints via `parse_task_blueprint`), `parse_test_failure_markers`, `verify_red_task`, `verify_green_task`, `verify_exempt_task` (failing fast on undeclared exempt category), and `verify_task_execution` driven by `RepoProfile` and in-process `strategy` (zero subprocess/importlib calls)
    - [ ] Run `test_supervisor.py` and confirm expected failures
- [ ] Task: Implement `supervisor.py` (TDD Green phase)
    - [ ] Implement `scripts/conductor-tools/conductor_tools/supervisor.py` using `RepoProfile` and in-process `strategy` APIs
    - [ ] Run `test_supervisor.py` and confirm all tests pass
- [ ] Task: Write failing unit tests for `orchestrator.py` and `auto_cli.py` (TDD Red phase)
    - [ ] Create `scripts/conductor-tools/tests/test_orchestrator.py` testing `dispatch_tier1_planning`, `dispatch_tier2_execution`, `dispatch_recovery_turn`, `dispatch_gate1_checkpoint`, `dispatch_gate2_review`, and skip-gate predicates via in-process `templates.generate_turn_prompt()`
    - [ ] Create `scripts/conductor-tools/tests/test_auto_cli.py` testing `conductor-auto` CLI flags (`-C`/`--repo-root`, `--dry-run`, `--force-plan`, `--skip-plan`, `--timeout`, `--heartbeat`, `--no-review`, `--force-review`, `--review-only`, `--auto-recover`, `--brain-dir`, model flags), erroring cleanly on `--task <checkpoint_num>`, and synthetic-repo `--dry-run` without `conductor/profile.toml` (verifying 1:1 behavioral parity across all legacy `test_conductor_auto.py` / `test_generate_prompt.py` assertions)
    - [ ] Run `test_orchestrator.py` and `test_auto_cli.py` and confirm expected failures
- [ ] Task: Implement `orchestrator.py` and `auto_cli.py` (TDD Green phase)
    - [ ] Implement `scripts/conductor-tools/conductor_tools/orchestrator.py` using in-process `templates.generate_turn_prompt()`
    - [ ] Implement `scripts/conductor-tools/conductor_tools/auto_cli.py` with `-C`/`--repo-root`, `--brain-dir`, non-zero error on `--task <checkpoint_num>`, and full CLI parity (without `--unattended`)
    - [ ] Run `python3.12 -m unittest discover -s scripts/conductor-tools/tests -t scripts/conductor-tools` and confirm all Phase 3 tests pass
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Streaming Telemetry, Process Adapter, Supervisor Gates & conductor-auto CLI' (Protocol in workflow.md)

## Phase 4: Python-3.6-Safe CLI Shims, `plan_parser.py` Removal & Integration Smoke Suites
- [ ] Task: Write failing repo integration smoke tests in `scripts/__tests__/test_generate_prompt.py` and `scripts/__tests__/test_conductor_auto.py` (TDD Red phase)
    - [ ] Refactor `scripts/__tests__/test_generate_prompt.py` into a concise repo integration smoke suite testing Python 3.6.8 `os.execvp` shim re-exec, CLI flags/output against live `conductor/profile.toml`, and rejection of `--full`
    - [ ] Refactor `scripts/__tests__/test_conductor_auto.py` into a concise repo integration smoke suite testing Python 3.6.8 `os.execvp` shim re-exec, `--dry-run` / CLI contract against live `conductor/profile.toml`, `TestAgyCliContract` (host `agy` check), and removal of `scripts/agent/plan_parser.py`
    - [ ] Confirm smoke tests fail against legacy monolithic scripts before shim replacement
- [ ] Task: Convert `generate-prompt.py` & `conductor-auto.py` to Python-3.6-safe shims and delete `plan_parser.py` (TDD Green phase)
    - [ ] Replace `scripts/agent/generate-prompt.py` with a thin Python-3.6-safe executable shim (`os.execvp` to `python3.12`/`python3.11`, bootstrapping `scripts/conductor-tools` onto `sys.path`, calling `conductor_tools.prompt_cli:main`, no `_ShimModuleProxy`)
    - [ ] Replace `scripts/agent/conductor-auto.py` with a thin Python-3.6-safe executable shim (`os.execvp` to `python3.12`/`python3.11`, bootstrapping `scripts/conductor-tools` onto `sys.path`, calling `conductor_tools.auto_cli:main`, no `_ShimModuleProxy`)
    - [ ] Delete `scripts/agent/plan_parser.py`
    - [ ] Verify both `python3` (3.6.8 re-exec) and `python3.12` CLI invocations and run integration smoke tests
- [ ] Task: Update `package.json` scripts (`conductor:prompt`, `conductor:auto`, `test:conductor-tools`, `test:agent:all`) [exempt: infra]
    - [ ] Keep `"conductor:prompt": "python3 scripts/agent/generate-prompt.py"`, add `"conductor:auto": "python3 scripts/agent/conductor-auto.py"` and `"test:conductor-tools": "python3.12 -m unittest discover -s scripts/conductor-tools/tests -t scripts/conductor-tools"`, and include `test:conductor-tools` in `test:agent:all`
    - [ ] Run `npm run test:agent:all` and confirm all portable, integration smoke, and `agent-resolve` tests pass
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Python-3.6-Safe CLI Shims, plan_parser.py Removal & Integration Smoke Suites' (Protocol in workflow.md)

## Phase 5: Documentation Synchronization
- [ ] Task: Create `scripts/conductor-tools/README.md` with CLI guide, `conductor/profile.toml` schema reference, canonical glossary, and design rationale [exempt: docs]
    - [ ] Document `conductor-prompt` and `conductor-auto` CLI usage, `-C`/`--repo-root`, `--review`, `CONDUCTOR_BRAIN_DIR`/`--brain-dir`, and standalone installation (`pipx`/`uv tool`)
    - [ ] Document all 9 `conductor/profile.toml` sections (replace-on-key merge rules & strict validation), canonical tooling glossary, and pre-computation/zero-amnesia design rationale
- [ ] Task: Synchronize existing project documentation and remove stale `plan_parser.py` / `--full` references [exempt: docs]
    - [ ] Update `scripts/README.md`, `docs/agents/conductor-auto.md`, `conductor/workflow.md`, and `conductor/docs/implement-prompt.md`
    - [ ] Update `scripts/agent/CHANGELOG.md` under `## [Unreleased]`
    - [ ] Verify zero stale references to `plan_parser.py` or `--full` across docs and confirm root `CONTEXT.md` is untouched
- [ ] Task: Conductor - User Manual Verification 'Phase 5: Documentation Synchronization' (Protocol in workflow.md)
