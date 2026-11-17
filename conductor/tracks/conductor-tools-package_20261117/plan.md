# Implementation Plan: Portable `conductor-tools` Package & `RepoProfile` Seam (Issue #110)

## Phase 1: Package Scaffolding, Core Models & `RepoProfile` Seam [checkpoint: e21660ef]
- [x] Task: Scaffold `scripts/conductor-tools/pyproject.toml` and `conductor_tools/__init__.py` package skeleton (`requires-python >= 3.11`, zero dependencies, console scripts `conductor-prompt` and `conductor-auto`) [exempt: infra] [commit: eb76c831]
    - [x] Create `scripts/conductor-tools/pyproject.toml` with `setuptools.build_meta`, `requires-python = ">=3.11"`, zero runtime dependencies, and `[project.scripts]` entries
    - [x] Create `scripts/conductor-tools/conductor_tools/__init__.py` and `scripts/conductor-tools/tests/__init__.py`
- [x] Task: Write failing unit tests for `models.py` and `profile.py` (TDD Red phase) [commit: dcd7d4b1]
    - [x] Create `scripts/conductor-tools/tests/test_models.py` testing frozen `slots=True` dataclasses (`PromptMode`, `TaskInfo`, `PhaseInfo`, `TrackPlan`, `TaskBlueprint`, `PhaseCheckpointContext`, `VerificationStrategy`, `TurnStreamConfig`, `ReviewResult`) and `ConductorError` exception hierarchy (`PlanInvariantError`, `ProcessExecutionError`, `SupervisorInvariantError`, `GitTreeDirtyError`)
    - [x] Create `scripts/conductor-tools/tests/test_profile.py` testing generic built-in `RepoProfile` defaults (zero Finger Lakes paths, generic `PathRules`, `docs`/`infra`/`scripts` exempt rules, generic verification tokens), `load_repo_profile` `tomllib` parsing, replace-on-key merging, and strict schema validation raising `ConductorError` on unknown sections/keys or invalid types
    - [x] Run `python3.12 -m unittest discover -s scripts/conductor-tools/tests -t scripts/conductor-tools -p "test_models.py"` and `test_profile.py` and confirm expected failures
- [x] Task: Implement `models.py`, `profile.py`, and Finger Lakes `conductor/profile.toml` (TDD Green phase) [commit: f4b3876b]
    - [x] Implement `scripts/conductor-tools/conductor_tools/models.py` with frozen `slots=True` dataclasses and exception hierarchy
    - [x] Implement `scripts/conductor-tools/conductor_tools/profile.py` with generic built-in defaults, `tomllib` loader, replace-on-key merging, and strict validation
    - [x] Author `conductor/profile.toml` capturing Finger Lakes suites (`integration`, `unit`, `e2e`, `edge_functions`, `python_agent`), domain rules (`ui`, `database`, `backend_tooling`), exempt rules (`ui`, `styling`, `infra`, `scripts`, `types`, `docs`), paths, supervisor (`static_analysis_prefixes`, `default_test_cmd`, `full_suite_keywords`), safety patterns, and model defaults
    - [x] Run `test_models.py` and `test_profile.py` and confirm all Phase 1 tests pass
- [x] Task: Conductor - User Manual Verification 'Phase 1: Package Scaffolding, Core Models & RepoProfile Seam' (Protocol in workflow.md) [commit: e21660ef]

### Phase: Review Fixes
- [x] Task: Apply Phase 1 review remediations (`conductor/profile.toml` Red static-analysis parity, positive/finite supervisor timing validation, duplicate `[exempt]` and non-empty string checks) [commit: f680bd45]

## Phase 2: Markdown Parser & Git Workspace Adapter
- [x] Task: Write failing unit tests for `parser.py` (TDD Red phase) [commit: 57650acc]
    - [x] Create `scripts/conductor-tools/tests/test_parser.py` testing `tracks.md` registry parsing, `plan.md` `PhaseInfo`/`TaskInfo` parsing (`Review Fixes`, `[exempt: <category>]`, `[-]` skipped, SHAs, without `.to_dict()` bridges), `TaskBlueprint` separation of `target_files` vs `referenced_test_files` via `PathRules`, full backtick command extraction (`=` / flags / `&&`), post-exec commit extraction, and `phase-N-review.md` severity parsing
    - [x] Run `python3.12 -m unittest discover -s scripts/conductor-tools/tests -t scripts/conductor-tools -p "test_parser.py"` and confirm expected failures
- [x] Task: Implement `parser.py` (TDD Green phase) [commit: a5c3bccb]
    - [x] Implement `scripts/conductor-tools/conductor_tools/parser.py` absorbing `plan_parser.py` without `.to_dict()` bridges and separating `TaskBlueprint.target_files` / `referenced_test_files` via `PathRules`
    - [x] Run `test_parser.py` and confirm all tests pass
- [ ] Task: Write failing unit tests for `git_scope.py` (TDD Red phase)
    - [ ] Create `scripts/conductor-tools/tests/test_git_scope.py` testing `resolve_repo_root` (`-C`/`--repo-root` fast-fail when invalid/missing `conductor/`, `cwd` walk stopping at `.git` boundaries, script-path fallback only when `cwd` is outside any `.git` repo), track root discovery, baseline/end SHA resolution, git diff/status helpers, commit/notes auditing, and `copy_to_clipboard` (`stdout=DEVNULL` + timeout)
    - [ ] Run `python3.12 -m unittest discover -s scripts/conductor-tools/tests -t scripts/conductor-tools -p "test_git_scope.py"` and confirm expected failures
- [ ] Task: Implement `git_scope.py` (TDD Green phase)
    - [ ] Implement `scripts/conductor-tools/conductor_tools/git_scope.py` with git-boundary-guarded `resolve_repo_root`, git inspection/audit adapters, and `copy_to_clipboard` (`stdout=DEVNULL` + timeout)
    - [ ] Run `python3.12 -m unittest discover -s scripts/conductor-tools/tests -t scripts/conductor-tools` and confirm all Phase 2 tests pass
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Markdown Parser & Git Workspace Adapter' (Protocol in workflow.md)

## Phase 3: Single-Pass Verification Strategy Engine
- [ ] Task: Write failing unit tests for `strategy.py` (TDD Red phase)
    - [ ] Create `scripts/conductor-tools/tests/test_strategy.py` testing unified `classify_task_mode()` (including `startswith("test(")`), fast-fail `ConductorError` on undeclared `[exempt: <category>]`, Red-mode stripping of `[supervisor].static_analysis_prefixes` (including env-prefixed static-analysis commands and excluding static-analysis `explicit_subtask_cmds` in Red mode), ordered all-matching `[[suites]]` loop with `shlex.quote`-escaped `{files}`, `[type_check].extensions` gating, `full_suite_keywords` handling, single-pass `VerificationStrategy` inference, `PhaseCheckpointContext` collection (excluding `referenced_test_files`), quote-aware `&&` splitting, leading `cd <subdir>` / env-prefix-stripped `safety` and idempotency filtering (preserving `cd <subdir>` + `KEY=VALUE` while blocking env-prefixed `cd`, env-prefixed mutations, and dangling `cd`-only chains), and shared `parse_verification_commands()` (`KEY=VALUE` `env=` extraction, blocked `LD_*`/`DYLD_*`/`BASH_ENV`/`ENV`/`PYTHONINSPECT`, repo-bounded `cd <dir>`, and rejection of unquoted newlines/pipes/redirections/`;`/`||`/env-prefixed `export`/subshells/bare `VAR=val`/unbalanced quotes)
    - [ ] Run `python3.12 -m unittest discover -s scripts/conductor-tools/tests -t scripts/conductor-tools -p "test_strategy.py"` and confirm expected failures
- [ ] Task: Implement `strategy.py` (TDD Green phase)
    - [ ] Implement `scripts/conductor-tools/conductor_tools/strategy.py` with unified classification, fail-fast undeclared exempt handling, Red static-analysis stripping, data-driven `[[suites]]` loop, `[type_check]` extension gating, single-pass `VerificationStrategy` computation, and shared quote-aware `parse_verification_commands()` / `cd` + env-prefix filtering (and drop redundant `"TEST_TYPE="` from `conductor/profile.toml` `[safety].command_prefixes`)
    - [ ] Run `python3.12 -m unittest discover -s scripts/conductor-tools/tests -t scripts/conductor-tools` and confirm all Phase 3 tests pass
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Single-Pass Verification Strategy Engine' (Protocol in workflow.md)

## Phase 4: Prompt Templates & `conductor-prompt` CLI
- [ ] Task: Write failing unit tests for `templates.py` (TDD Red phase)
    - [ ] Create `scripts/conductor-tools/tests/test_templates.py` testing Plan (including verification-command shell constraints in `Execution Verification Protocol`), Red, Green, Exempt, Checkpoint (interactive & `--unattended`), Recovery, and Gate 2 Review prompt rendering (`build_review_prompt`) driven by `RepoProfile`, plus `generate_turn_prompt()` in-process helper and removal of composite TDD branch
    - [ ] Run `python3.12 -m unittest discover -s scripts/conductor-tools/tests -t scripts/conductor-tools -p "test_templates.py"` and confirm expected failures
- [ ] Task: Implement `templates.py` (TDD Green phase)
    - [ ] Implement `scripts/conductor-tools/conductor_tools/templates.py` with pure Python prompt builders (including `build_review_prompt` and Tier 1 verification command formatting rules) driven by `RepoProfile` and in-process `generate_turn_prompt()`
    - [ ] Run `test_templates.py` and confirm all tests pass
- [ ] Task: Write failing unit tests for `prompt_cli.py` (TDD Red phase)
    - [ ] Create `scripts/conductor-tools/tests/test_prompt_cli.py` testing `conductor-prompt` CLI flags (`-C`/`--repo-root`, `--plan`, `--exec`, `--checkpoint`, `--unattended`, `--recovery`, `--review` with optional `[track] [phase]` and `--report-path`, `--copy`), explicit `--red`/`--green` overrides (warning on `[exempt]`, error on checkpoint), rejection of removed `--full` flag, single-pass strategy execution, and synthetic-repo execution without `conductor/profile.toml`
    - [ ] Run `python3.12 -m unittest discover -s scripts/conductor-tools/tests -t scripts/conductor-tools -p "test_prompt_cli.py"` and confirm expected failures
- [ ] Task: Implement `prompt_cli.py` (TDD Green phase)
    - [ ] Implement `scripts/conductor-tools/conductor_tools/prompt_cli.py` supporting `-C`/`--repo-root`, `--review`, mode overrides, and all prompt modes (without `--full`)
    - [ ] Run `python3.12 -m unittest discover -s scripts/conductor-tools/tests -t scripts/conductor-tools` and confirm all Phase 4 tests pass
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Prompt Templates & conductor-prompt CLI' (Protocol in workflow.md)

## Phase 5: Streaming Telemetry, Subprocess Adapter & Model Matrix
- [ ] Task: Write failing unit tests for `streaming.py` (TDD Red phase)
    - [ ] Create `scripts/conductor-tools/tests/test_streaming.py` testing `DualLogger`, `_StreamJsonTracker`, `_TurnOutputSink`, NDJSON `conversation_id` extraction, and brain directory snapshotting with `CONDUCTOR_BRAIN_DIR` override
    - [ ] Run `python3.12 -m unittest discover -s scripts/conductor-tools/tests -t scripts/conductor-tools -p "test_streaming.py"` and confirm expected failures
- [ ] Task: Implement `streaming.py` (TDD Green phase)
    - [ ] Implement `scripts/conductor-tools/conductor_tools/streaming.py` with configurable `brain_dir`
    - [ ] Run `test_streaming.py` and confirm all tests pass
- [ ] Task: Write failing unit tests for `process.py` (TDD Red phase)
    - [ ] Create `scripts/conductor-tools/tests/test_process.py` testing `build_agy_command` flag ordering, `run_agy_turn`, `_drain_stdout_select`, removal of dead `proc.stdin.write` path, process-group SIGTERM/SIGKILL termination, `parse_timeout`, and 4-tier `resolve_model_config` (`--<role>-model` > `CONDUCTOR_<ROLE>_MODEL` > `--model-family`/`CONDUCTOR_MODEL_FAMILY` + `efforts` > `profile.models`)
    - [ ] Run `python3.12 -m unittest discover -s scripts/conductor-tools/tests -t scripts/conductor-tools -p "test_process.py"` and confirm expected failures
- [ ] Task: Implement `process.py` (TDD Green phase)
    - [ ] Implement `scripts/conductor-tools/conductor_tools/process.py` without dead `proc.stdin.write` code and with 4-tier `resolve_model_config`
    - [ ] Run `python3.12 -m unittest discover -s scripts/conductor-tools/tests -t scripts/conductor-tools` and confirm all Phase 5 tests pass
- [ ] Task: Conductor - User Manual Verification 'Phase 5: Streaming Telemetry, Subprocess Adapter & Model Matrix' (Protocol in workflow.md)

## Phase 6: Post-Turn Supervisor Verification Gates
- [ ] Task: Write failing unit tests for `supervisor.py` (TDD Red phase)
    - [ ] Create `scripts/conductor-tools/tests/test_supervisor.py` testing `check_plan_cache` and `assert_post_plan_invariants` (rejecting whitespace-only/empty blueprints via `parse_task_blueprint` and invalid verification command syntax via `strategy.parse_verification_commands(..., check_cd_exists=False)`), `parse_test_failure_markers` (including `RepoProfile.paths`-driven target-scoped `ModuleNotFoundError` / symbol-miss `ImportError: cannot import name ...` / `Cannot find module` / `TS2307` acceptance and `work_dir` dotted-package fallback vs rejection of untargeted/test-module imports and non-loader unittest `ERROR:` tracebacks), `verify_red_task` (including `ast.parse` syntax checks on changed `.py` test files and `expected_targets` extraction via `TaskBlueprint` + `RepoProfile.paths`), `verify_green_task`, `verify_exempt_task` (failing fast on undeclared exempt category), shared `strategy.parse_verification_commands(..., check_cd_exists=True)` execution (`KEY=VALUE` `env=` merging, repo-bounded `cd <dir>`, wrapping `(OSError, ValueError)` as `SupervisorInvariantError`), `audit_git_commit_and_notes`, `verify_checkpoint_commit_and_notes`, `revert_false_task_completion` (public cross-module helper replacing legacy `_revert_false_task_completion`), and `verify_task_execution` driven by `RepoProfile` and in-process `strategy` (zero subprocess/importlib calls)
    - [ ] Run `python3.12 -m unittest discover -s scripts/conductor-tools/tests -t scripts/conductor-tools -p "test_supervisor.py"` and confirm expected failures
- [ ] Task: Implement `supervisor.py` (TDD Green phase)
    - [ ] Implement `scripts/conductor-tools/conductor_tools/supervisor.py` using `RepoProfile` (`RepoProfile.paths` for `expected_targets` / dotted-package fallback, zero hardcoded repo root dirs) and in-process `strategy` APIs (including Tier 1 verification-command validation, `KEY=VALUE` `env=` / repo-bounded `cd` execution, `(OSError, ValueError)` -> `SupervisorInvariantError` wrapping, target-scoped Red verification, `ast.parse` test syntax checks, and public `revert_false_task_completion`)
    - [ ] Run `python3.12 -m unittest discover -s scripts/conductor-tools/tests -t scripts/conductor-tools` and confirm all Phase 6 tests pass
- [ ] Task: Conductor - User Manual Verification 'Phase 6: Post-Turn Supervisor Verification Gates' (Protocol in workflow.md)

## Phase 7: Turn Orchestrator & `conductor-auto` CLI
- [ ] Task: Write failing unit tests for `orchestrator.py` (TDD Red phase)
    - [ ] Create `scripts/conductor-tools/tests/test_orchestrator.py` testing `dispatch_tier1_planning`, `dispatch_tier2_execution` (including 1 bounded `--auto-recover` verification repair turn logging to `logs/phase-<P>-task-<T>-repair.log` with `PromptMode.RECOVERY` context, post-repair `check_working_tree_cleanliness`, `ProcessExecutionError` propagation without `[x]` revert on non-zero repair exit, and calling `supervisor.revert_false_task_completion` on persistent `SupervisorInvariantError`), `dispatch_recovery_turn`, `dispatch_verification_repair_turn`, `dispatch_gate1_checkpoint`, `dispatch_gate2_review`, and skip-gate predicates via in-process `templates.generate_turn_prompt()`
    - [ ] Run `python3.12 -m unittest discover -s scripts/conductor-tools/tests -t scripts/conductor-tools -p "test_orchestrator.py"` and confirm expected failures
- [ ] Task: Implement `orchestrator.py` (TDD Green phase)
    - [ ] Implement `scripts/conductor-tools/conductor_tools/orchestrator.py` using in-process `templates.generate_turn_prompt()` (including bounded verification repair, post-repair cleanliness check, and `supervisor.revert_false_task_completion` rollback)
    - [ ] Run `test_orchestrator.py` and confirm all tests pass
- [ ] Task: Write failing unit tests for `auto_cli.py` (TDD Red phase)
    - [ ] Create `scripts/conductor-tools/tests/test_auto_cli.py` testing `conductor-auto` CLI flags (`-C`/`--repo-root`, `--dry-run`, `--force-plan`, `--skip-plan`, `--timeout`, `--heartbeat`, `--no-review`, `--force-review`, `--review-only`, `--auto-recover`, `--brain-dir`, model flags), erroring cleanly on `--task <checkpoint_num>`, and synthetic-repo `--dry-run` without `conductor/profile.toml` (verifying 1:1 behavioral parity across all 179 legacy test methods from `test_conductor_auto.py` / `test_generate_prompt.py`)
    - [ ] Run `python3.12 -m unittest discover -s scripts/conductor-tools/tests -t scripts/conductor-tools -p "test_auto_cli.py"` and confirm expected failures
- [ ] Task: Implement `auto_cli.py` (TDD Green phase)
    - [ ] Implement `scripts/conductor-tools/conductor_tools/auto_cli.py` with `-C`/`--repo-root`, `--brain-dir`, non-zero error on `--task <checkpoint_num>`, and full CLI parity (without `--unattended`)
    - [ ] Run `python3.12 -m unittest discover -s scripts/conductor-tools/tests -t scripts/conductor-tools` and confirm all Phase 7 tests pass
- [ ] Task: Conductor - User Manual Verification 'Phase 7: Turn Orchestrator & conductor-auto CLI' (Protocol in workflow.md)

## Phase 8: Python-3.6-Safe CLI Shims, `plan_parser.py` Removal & Integration Smoke Suites
- [ ] Task: Write failing repo integration smoke tests in `scripts/__tests__/test_generate_prompt.py` and `scripts/__tests__/test_conductor_auto.py` (TDD Red phase)
    - [ ] Refactor `scripts/__tests__/test_generate_prompt.py` into a concise repo integration smoke suite testing Python 3.6.8 `os.execvp` shim re-exec, CLI flags/output against live `conductor/profile.toml`, and rejection of `--full`
    - [ ] Refactor `scripts/__tests__/test_conductor_auto.py` into a concise repo integration smoke suite testing Python 3.6.8 `os.execvp` shim re-exec, `--dry-run` / CLI contract against live `conductor/profile.toml`, `TestAgyCliContract` (host `agy` check), and removal of `scripts/agent/plan_parser.py` and `scripts/agent/shell_cmd_parser.py`
    - [ ] Confirm smoke tests fail against legacy monolithic scripts before shim replacement
- [ ] Task: Convert `generate-prompt.py` & `conductor-auto.py` to Python-3.6-safe shims and delete `plan_parser.py` (TDD Green phase)
    - [ ] Replace `scripts/agent/generate-prompt.py` with a thin Python-3.6-safe executable shim (`os.execvp` to `python3.12`/`python3.11`, bootstrapping `scripts/conductor-tools` onto `sys.path`, calling `conductor_tools.prompt_cli:main`, no `_ShimModuleProxy`)
    - [ ] Replace `scripts/agent/conductor-auto.py` with a thin Python-3.6-safe executable shim (`os.execvp` to `python3.12`/`python3.11`, bootstrapping `scripts/conductor-tools` onto `sys.path`, calling `conductor_tools.auto_cli:main`, no `_ShimModuleProxy`)
    - [ ] Delete `scripts/agent/plan_parser.py` and `scripts/agent/shell_cmd_parser.py`
    - [ ] Verify both `python3` (3.6.8 re-exec) and `python3.12` CLI invocations and run integration smoke tests
- [ ] Task: Update `package.json` scripts (`conductor:prompt`, `conductor:auto`, `test:conductor-tools`, `test:agent:all`) [exempt: infra]
    - [ ] Keep `"conductor:prompt": "python3 scripts/agent/generate-prompt.py"`, add `"conductor:auto": "python3 scripts/agent/conductor-auto.py"` and `"test:conductor-tools": "python3.12 -m unittest discover -s scripts/conductor-tools/tests -t scripts/conductor-tools"`, and include `test:conductor-tools` in `test:agent:all`
    - [ ] Run `npm run test:agent:all` and confirm all portable, integration smoke, and `agent-resolve` tests pass
- [ ] Task: Conductor - User Manual Verification 'Phase 8: Python-3.6-Safe CLI Shims, plan_parser.py Removal & Integration Smoke Suites' (Protocol in workflow.md)

## Phase 9: Documentation Synchronization
- [ ] Task: Create `scripts/conductor-tools/README.md` with CLI guide, `conductor/profile.toml` schema reference, canonical glossary, and design rationale [exempt: docs]
    - [ ] Document `conductor-prompt` and `conductor-auto` CLI usage, `-C`/`--repo-root`, `--review`, `CONDUCTOR_BRAIN_DIR`/`--brain-dir`, and standalone installation (`pipx`/`uv tool`)
    - [ ] Document all 9 `conductor/profile.toml` sections (replace-on-key merge rules & strict validation), canonical tooling glossary, and pre-computation/zero-amnesia design rationale
- [ ] Task: Synchronize existing project documentation and remove stale `plan_parser.py` / `--full` references [exempt: docs]
    - [ ] Update `scripts/README.md`, `docs/agents/conductor-auto.md`, `conductor/workflow.md`, and `conductor/docs/implement-prompt.md`
    - [ ] Update `scripts/agent/CHANGELOG.md` under `## [Unreleased]`
    - [ ] Verify zero stale references to `plan_parser.py` or `--full` across docs and confirm root `CONTEXT.md` is untouched
- [ ] Task: Conductor - User Manual Verification 'Phase 9: Documentation Synchronization' (Protocol in workflow.md)
