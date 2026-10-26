# agent-resolve Changelog

All notable changes to the `agent-resolve` autonomous issue resolution tool are documented in this file.

## [agent-resolve] - v0.2.0 (2026-10-23)

### 🛡️ Quality Hardening, Patch-Based Red Phase, Test Deduplication & Prompt Token Optimization ([ADR-0005](../../docs/adr/0005-autonomous-nightly-agent-workflow.md))
* **Patch-Based Test Authoring & Unified Patch Engine (Phase 1)**:
    * Replaced full-file test overwriting with surgical search/replace patch application via `TestPatchManifest` (`patches` and `source_stubs`) in `agent_resolve.models` and `agent_resolve.stages.stage_2_red`.
    * Enforced strict patch file whitelisting (`allowed_files=target_tests`) to prevent accidental source file tampering during the Red phase.
    * Added empty search-block (`search_block=""`) support to `apply_patch_manifest` (`agent_resolve.patch_engine`) to cleanly author brand new test files.
    * Guaranteed deterministic retry cycles by reverting target test files to git baseline and purging uncommitted source stubs before each attempt.
* **Target Test Deduplication & Architectural Cohesion (Phase 2)**:
    * Implemented `deduplicate_target_test_files` in `agent_resolve.context`, grouping test files by architectural component stem (`<stem>.*.test.ts*` vs `<stem>.test.ts*`).
    * Retained the most specialized suite (`*.persist.test.ts`, `*.enrichment.test.ts`) in `target_test_files` while demoting broader suites into `blast_radius_test_files`, capped at 8 suites.
    * Added Stage 1 architectural planning prompt directive enforcing a single primary test suite per component to avoid redundant authoring and test execution overlap.
* **Targeted ESLint Verification Gate & Code Hygiene Directives (Phase 3)**:
    * Integrated targeted ESLint execution (`npx eslint --no-warn-ignored <target_src_files>`) in Stage 3 Green phase verification (`agent_resolve.stages.stage_3_green`), executing after TypeScript compilation and before Jest.
    * Wired ESLint diagnostic failures directly into the self-correction retry loop via `last_error_context`.
    * Added `"no-nested-ternary": "error"` rule to `eslint.config.mjs` and refactored nested ternaries across core utilities and components (`lib/utils/adapters/google-v1.ts`, `components/TripCardSimplePresentational.tsx`).
    * Added explicit code hygiene prompt directives prohibiting nested ternaries (>1 level) and mandating pure helper extraction.
* **Edge Function Runtime Boundary Hard Gating (Phase 4)**:
    * Hardened `is_issue_suitable_for_headless_agent` in `agent_resolve.context` to reject all issues attempting to modify `supabase/functions/` (including `_shared/`).
    * Enforced hard gates upfront in `agent_resolve.pipeline` and after Stage 0 diagnostic exploration, posting maintainer advisory comments via GitHub CLI and cleanly terminating without burning tokens.
    * Removed Edge Function authoring instructions (Directive 10) from Stage 1 and Stage 2 prompts to align with runtime boundaries.
* **Context Pruning & Static Prefix Prompt Caching Layout (Phase 5)**:
    * Updated `get_project_context(include_tree: bool = False)` in `agent_resolve.context` with a `False` default, omitting repository source file trees from Stage 2 and Stage 3 prompts.
    * Explicitly isolated repository tree retrieval to Stage 1 Planner prompts via `get_repository_tree()`.
    * Restructured prompt formatting across Stages 1, 2, and 3: placed immutable role headers and static domain guidelines (`CONTEXT.md`, `AGENTS.md`) at byte 0 ahead of dynamic issue context, maximizing Gemini prompt prefix caching efficiency.
* **Semantic Diagnostic Filtering & Stack Trace Pruning (Phase 6)**:
    * Updated `truncate_error_context` in `agent_resolve.diagnostics`: pruned internal framework and runtime stack frames matching `node_modules/`, `node:internal/`, and `internal/`, while strictly preserving user-space frames.
    * Preserved TypeScript compiler output (`error TS...`), ESLint diagnostics, and Jest multi-line assertion diffs (`- Expected`, `+ Received`, code frames, and caret markers).
    * Added regex-based normalization collapsing consecutive blank lines (`\n{3,}`) down to `\n\n`.
    * Lowered the default truncation ceiling to 4,000 characters (2,000 head / 2,000 tail with split marker) to prevent context blowout while retaining high diagnostic signal.
    * Updated Section 7 of [ADR-0005](../../docs/adr/0005-autonomous-nightly-agent-workflow.md) formally documenting diagnostic sanitization invariants.

## [agent-resolve] - v0.1.1 (2026-10-21)

### 🔒 Sandbox Hardening, Patch Whitelisting & Diagnostic Unmasking ([ADR-0005](../../docs/adr/0005-autonomous-nightly-agent-workflow.md))
* **Comprehensive Supabase Fallback Variables & Environment Consolidation**:
    * Defined `DEFAULT_SUPABASE_TEST_ENV` in `agent_resolve.environment` with canonical dummy values (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key`, and `SUPABASE_SERVICE_ROLE_KEY=test-service-role-key`).
    * Injected fallback environment variables into Docker container test execution (`--network none`) and scrubbed subprocess fallback execution, preventing runtime failures during Supabase client initialization in test sandboxes.
    * Added fallback defaults to `jest.setup.ts` via `process.env.* ||=` to protect direct Jest invocations.
* **Patch Whitelisting, Path Normalization & Pre-Attempt Working Tree Reset**:
    * Enforced strict patch target whitelisting (`allowed_files=target_src`) in `apply_patch_manifest` (`agent_resolve.patch_engine`), rejecting patches targeting un-targeted files.
    * Normalized file paths (`safe_resolve_repo_path` targets) for both `allowed_files` and `new_src_files` to eliminate path format mismatches (`./path` vs `path`).
    * Enforced clean working tree resets before each Stage 3 attempt (`git checkout baseline_ref -- .` and `git clean -fd`) in `agent_resolve.stages.stage_3_green`, preventing dirty state accumulation across retry attempts.
    * Preserved `blast_radius_test_files` immutability, ensuring regression test suites remain execution-only guards.
* **Diagnostic Unmasking & Mandatory Full Regression Gate**:
    * Merged stdout and stderr (`f"{out}\n{err}".strip()`) before passing failure output to `truncate_error_context` in `agent_resolve.stages.stage_3_green`, preventing non-fatal stderr messages (deprecation warnings, bundler notices) from shadowing Jest assertion failures.
    * Enforced `npm run type-check` before full test suite execution in the mandatory full regression gate.
* **Resumption Git Index Hygiene & ADR Documentation**:
    * Explicitly purged checkpoint metadata files (`.agent-state.json`, `AGENT_HANDOFF.md`) from the git index (`git rm -f --ignore-unmatch` and `git reset HEAD`) prior to staging target sources on checkpoint resumption in `agent_resolve.vcs`.
    * Updated [ADR-0005](../../docs/adr/0005-autonomous-nightly-agent-workflow.md) documenting Supabase sandbox fallback injection and blast radius isolation invariants.
* **Maintainer Agent Brief Triage Ingestion ([ADR-0005](../../docs/adr/0005-autonomous-nightly-agent-workflow.md))**:
    * Expanded GitHub CLI issue queries (`gh issue view` and `gh issue list`) in `agent_resolve.cli` to retrieve issue comments (`--json number,title,body,author,labels,comments`).
    * Implemented `extract_agent_brief` in `agent_resolve.context` to parse issue comments and extract authoritative maintainer `## Agent Brief` specifications authored strictly by `@jarredb9` (per `.agents/skills/triage/AGENT-BRIEF.md`).
    * Injected authoritative triage specifications (`### AUTHORITATIVE TRIAGE SPECIFICATION:\n<brief>`) into `issue_body` across `resolve_issue` (`agent_resolve.pipeline`), anchoring complexity suitability evaluation, Stage 0 diagnostic exploration, and Stage 1 blueprint planning directly to maintainer acceptance criteria.

## [agent-resolve] - v0.1.0 (2026-10-19)

### 🛡️ Prompt Token Blowout Prevention, Blast-Radius Test Isolation & Cached Token Accounting ([#77](https://github.com/jarredb9/finger-lakes-app-57/issues/77) / [ADR-0005](../../docs/adr/0005-autonomous-nightly-agent-workflow.md))
* **Blast-Radius Test Isolation & Ancestor Proximity Ranking**:
    * Added `blast_radius_test_files` to `BlueprintPlan` (`agent_resolve.models`), serializing to `.agent-state.json` and reporting in the PR body (`agent_resolve.vcs`) to separate regression verification suites from LLM prompt context.
    * Hardened test discovery in `agent_resolve.context` (`find_related_test_files`): restricted pathspecs strictly to Jest test extensions (`**/*.test.ts(x)`, `**/*.spec.ts(x)`), excluded `supabase/` and `e2e/`, qualified generic module stems (`index`, `types`, `constants`, `utils`, `helpers`) with directory paths to avoid cross-module collisions, matched import boundaries via POSIX ERE-compatible regex (`/(?:{pattern})(?:\.[a-zA-Z]+)?['\"]` and `from.*{pattern}`), sorted candidate suites by common ancestor directory depth descending, and capped discovered suites at 8 files.
    * Enforced prompt isolation in `stage_1_plan`, `stage_2_red`, and `stage_3_green`: only `target_test_files` are authored in Stage 2 and injected into the `TESTS TO PASS` section of Stage 3 prompts, while blast-radius suites execute strictly as immutable regression guards in Stage 3.
* **Fail-Fast TypeScript Compilation, Silent Jest & Error Output Truncation**:
    * Implemented fail-fast compiler check in `agent_resolve.stages.stage_3_green`: runs `npm run type-check` before targeted Jest verification; if compilation fails (`tc_code != 0`), skips running Jest on that attempt and populates `last_error_context` solely with TypeScript errors.
    * Configured targeted Jest verification with `["npx", "jest", "--no-color", "--silent"] + target_tests + blast_radius_tests` to suppress ANSI escape sequences and console noise from passing suites.
    * Sequenced `npm run type-check` ahead of `npm test` in the Mandatory Full Regression Gate to fail fast on compilation errors prior to running the full test suite.
    * Implemented ANSI escape sequence stripping and head/tail error truncation capping `last_error_context` at 8,000 characters (retaining 4,000 head and 4,000 tail characters with `... [TRUNCATED {chars} CHARS OF VERIFICATION OUTPUT] ...`), preventing context blowout from large stack traces.
* **Discounted Cached Token Budgeting (25%), Pre-Call Guard & Boundary Regex**:
    * Implemented `effective_tokens` in `TokenTracker` (`agent_resolve.tracker`) applying a 25% discount weight to cached prompt tokens (`effective_call_tokens = max(0, total - cached) + int(0.25 * cached)`), preventing premature halting on repeated context queries while maintaining the 500,000-token issue budget limit.
    * Added pre-flight `check_budget()` guard in `agent_resolve.llm` before issuing Gemini API calls and exponential backoff retries to fail fast when budget is exhausted.
    * Isolated `token_tracker.record_usage()` outside the transient retry handler, eliminating false-positive budget error retries.
    * Hardened transient error detection with status-boundary regex `r"(?<![0-9,])(?:429|500|502|503|504)(?![0-9,])"` to prevent false-positive retries on formatted token amounts (`500,000`) or line numbers.
    * Formatted dual metrics in `summary()`, PR bodies, and logs (`<effective> effective tokens / <raw> raw total (<prompt> prompt [<cached> cached @ 25%], <candidates> candidates)`).
* **Shared Edge Function (`supabase/functions/_shared/*.ts`) Verification Invariant & Planner Self-Correction**:
    * Implemented target test file validation guard in `stage_1_plan.py` filtering out `supabase/**`, `e2e/**`, and non-Jest paths, backed by an internal 2-attempt self-correction loop when target test suites become empty.
    * Added explicit Planner and Red Phase prompt instructions requiring unit tests for pure-TypeScript shared Edge Functions (`supabase/functions/_shared/*.ts`) to be authored under `lib/**/__tests__/*.test.ts` importing via `@/supabase/functions/_shared/<module>`.
    * Updated `is_issue_suitable_for_headless_agent` in `agent_resolve.context` to permit pure-TypeScript shared modules while flagging Deno runtime entrypoints (`Deno.serve`, `jsr:`, `https://deno.land`, `deno.json`) and non-shared functions.
* **Stateful Resumption Checkpoint Self-Healing & VCS State Persistence**:
    * Implemented checkpoint sanitization in `agent_resolve.pipeline` (`resolve_issue`): queries files modified in `red_phase_commit_sha` via `git diff-tree`, demoting extra valid Jest suites from dirty checkpoints to `blast_radius_test_files`, deduplicating, stripping non-Jest files, and capping at 8 suites (with fallback to first 3 valid Jest suites if diff is unavailable).
    * Guaranteed `BlueprintPlan` instantiations preserve `blast_radius_test_files` across both clean resumption and Tier 3 checkpoint invalidation rollback.
    * Serialized `blast_radius_test_files` into `.agent-state.json` via `preserve_failed_work` and draft PR summaries in `agent_resolve.vcs`.
* **ADR Documentation & Comprehensive Test Verification**:
    * Updated [ADR-0005](../../docs/adr/0005-autonomous-nightly-agent-workflow.md) to formally document blast-radius isolation, 25% cached token budgeting, fail-fast compiler gates, 8k error context truncation, and shared Edge Function testing rules.
    * Authored extensive unit tests across `scripts/agent-resolve/tests/` (test suites for models, context, stages, tracker, llm, and pipeline), verifying 100% pass rate alongside legacy test suites via `npm run test:agent:all`.

### 🤖 Autonomous Issue Resolver Decomposition & Modular Architecture ([ADR-0005](../../docs/adr/0005-autonomous-nightly-agent-workflow.md))
* **Modular Package Architecture & PEP 621 Packaging Metadata**:
    * Decomposed the monolithic 2,200-line autonomous resolver script `scripts/agent-resolve/agent-resolve.py` into a modular Python package located at `scripts/agent-resolve/agent_resolve/` with clean domain boundaries (`config`, `models`, `tracker`, `exceptions`, `environment`, `verification`, `patch_engine`, `vcs`, `llm`, `context`, `diagnostics`, `stages`, `pipeline`, and `cli`).
    * Configured standard PEP 621 packaging metadata in `scripts/agent-resolve/pyproject.toml` with build backend `setuptools.build_meta`, dependencies (`google-genai>=0.1.0`, `pydantic>=2.0.0`, `tenacity>=8.2.0`), Python `>=3.12`, and console entrypoint `agent-resolve = agent_resolve.cli:main`.
    * Added developer npm test scripts `"test:agent"` and `"test:agent:all"` in `package.json` with `sys.path` fallback bootstrapping in `scripts/agent-resolve/tests/__init__.py` to run modular tests without requiring editable package installation (`pip install -e`).
* **Centralized Configuration & Dynamic Monkeypatch Propagation (`_AgentResolveModule`)**:
    * Centralized global parameters in `agent_resolve.config` with depth-3 ancestor-walk `PROJECT_ROOT` resolution detecting repository root via `package.json`/`.git` markers (with `parents[3]` fallback) and runtime accessors `get_project_root()` and `set_project_root()`.
    * Standardized all package submodules to dynamically evaluate `config.PROJECT_ROOT` at call time to prevent stale path bindings.
    * Implemented `_AgentResolveModule` (`types.ModuleType` proxy) in `scripts/agent-resolve/agent_resolve/__init__.py` to intercept `__setattr__`, synchronizing `PROJECT_ROOT` mutations and dynamically propagating monkeypatched collaborators (`patch.object(agent_resolve, "gh_cli", ...)`, `call_gemini_with_fallback`, etc.) across all loaded `agent_resolve.*` submodules.
* **Execution Environment, Secret Scrubbing & Verification Engine**:
    * Extracted process execution and container isolation helpers in `agent_resolve.environment`, executing test runners inside rootless containers (`--network none`, matching host UID/GID, and tmpfs directories) to eliminate secret exfiltration risks and file ownership mismatches.
    * Enforced SEC-02 secret scrubbing (`sanitize_secrets`) redacting GitHub tokens, PATs, AIza keys, and Bearer tokens across logging and error reporting.
    * Isolated test failure parsing in `agent_resolve.verification` (`validate_jest_red_phase`), validating structured assertion failures, rejecting runtime crashes, and breaking circular dependencies between pipeline resumption gates and Stage 2 test authoring.
* **Two-Tier Fuzzy Patch Engine & VCS Operations**:
    * Implemented two-tier fuzzy patch engine in `agent_resolve.patch_engine` (`apply_patch_manifest`) supporting Tier 1 strict exact matching, Tier 2 whitespace-trimmed line matching, CRLF normalization, and transactional rollback (`reset_target_sources`).
    * Enforced SEC-04 protected path blocking (`safe_resolve_repo_path`), barring modifications to database migrations (`supabase/migrations`), `.git/`, GitHub workflows, and agent scripts.
    * Centralized Git and GitHub CLI operations in `agent_resolve.vcs` (`gh_cli`), supporting branch management, PR lifecycle mutations, maintainer guidance ingestion (`fetch_maintainer_hints`), and stateful WIP checkpointing (`preserve_failed_work`).
* **LLM Client Standardization & Diagnostic Exploration Tools**:
    * Implemented `agent_resolve.llm` standardizing strictly on `gemini-3.8-flash` with zero model downgrades, randomized jitter exponential backoff on HTTP 429/5xx, and socket/transport drops.
    * Extracted read-only exploration tools in `agent_resolve.diagnostics` (`grep_search`, `find_files`, `read_file_snippet`) to power Stage 0 exploration.
* **Complete 4-Stage TDD Pipeline & Backward-Compatible Executable Shim**:
    * Decomposed the autonomous resolution workflow into 4 discrete pipeline stages under `agent_resolve.stages`:
        * **Stage 0 (`stage_0_diagnose`)**: Iterative tool-equipped diagnostic loop bounding target files and reproduction seams.
        * **Stage 1 (`stage_1_plan`)**: Grounded architectural blueprint generation authoring `task-plan.md`.
        * **Stage 2 (`stage_2_red`)**: Compiling stubs and failing test generation with **Tier 3 Blueprint Invalidation** fallback on unrecoverable architectural dead ends.
        * **Stage 3 (`stage_3_green`)**: Precision fuzzy patching, iterative test feedback, and mandatory full regression gate.
    * Modularized CLI argument parsing and batch orchestration loop into `agent_resolve.cli` and `agent_resolve.pipeline`.
    * Replaced monolithic `scripts/agent-resolve/agent-resolve.py` with an 80-line executable CLI shim featuring automated `sys.path` bootstrapping, `importlib.util.spec_from_file_location` loader self-healing, complete `__all__` symbol parity, and `_ShimModuleProxy` delegation.
* **Comprehensive Multi-Tier Test Suites & Verification**:
    * Authored 243 modular unit and integration tests across 14 dedicated test suites in `scripts/agent-resolve/tests/`.
    * Maintained 100% backward compatibility with all 27 legacy test cases in `scripts/__tests__/test_patch_engine.py` (270 total tests passing cleanly via `npm run test:agent:all`).
