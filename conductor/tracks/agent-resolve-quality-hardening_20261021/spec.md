# Specification: Agent-Resolve Quality Hardening & Token Optimization

## Overview
Quality hardening and performance optimization of the autonomous `agent-resolve` pipeline based on forensic analysis of Issue #73 / PR #83. This track eliminates Stage 2 token blowout (switching from full-file rewrites to search/replace patches), prevents duplicated unit test suites in Stage 1, adds targeted ESLint gating and code complexity rules in Stage 3, sets clean architectural runtime boundaries for Deno Edge Functions, and prunes prompt context to maximize static prefix prompt caching.

## Modular Improvement Phases

### 1. Stage 2 (Red Phase) Patch-Based Test Authoring & Unified Patch Engine
- **Target Files:** `scripts/agent-resolve/agent_resolve/stages/stage_2_red.py`, `models.py`, `patch_engine.py`, `tests/test_stages.py`
- Replace full-file `TestFileManifest` in `stage_2_red.py` with `PatchManifest` using `apply_patch_manifest`.
- Prompt the model for surgical search/replace blocks for existing test files (inserting `describe` or `it` blocks); allow `search_block = ""` for new test files.
- Deprecate and remove the brittle `extract_test_suite_names` preflight check.
- Add unit tests verifying patch manifest application in Stage 2.

### 2. Stage 1 Target Test Cohesion & Deduplication
- **Target Files:** `scripts/agent-resolve/agent_resolve/stages/stage_1_plan.py`, `context.py`, `tests/test_stages.py`, `tests/test_context.py`
- Implement deduplication logic in `stage_1_plan.py` / `context.py` capping target test files to 1 primary test suite per architectural component.
- Prioritize specialized test suites (e.g., `*.persist.test.ts`, `*.enrichment.test.ts`) over generic fallback `*.test.ts`.
- Add prompt directive in Stage 1 Planner: *"Select only the single most cohesive test file for each modified source file. Do not duplicate identical unit tests across multiple test files."*
- Author unit tests validating test suite deduplication.

### 3. Stage 3 (Green Phase) Targeted Linter Gate & Code Readability Invariants
- **Target Files:** `scripts/agent-resolve/agent_resolve/stages/stage_3_green.py`, `tests/test_stages.py`
- Add targeted ESLint verification in `stage_3_green.py` executing `npx eslint --no-warn-ignored <target_src_files>` right after type-checking passes.
- On lint failure (exit code != 0), capture, sanitize, and truncate diagnostic output into `last_error_context` and trigger a retry loop.
- Add prompt directive prohibiting nested ternaries (>1 level) and mandating extraction of complex conditionals into pure helper functions.
- Author unit tests verifying ESLint execution, error capture, and retry triggers.

### 4. Edge Function Runtime Boundary & Suitability Gate
- **Target Files:** `scripts/agent-resolve/agent_resolve/context.py`, `stage_1_plan.py`, `stage_2_red.py`, `tests/test_context.py`
- Update `is_issue_suitable_for_headless_agent` in `context.py` to flag issues touching `supabase/functions/` as unsuitable for headless overnight execution, routing them to interactive Antigravity CLI sessions.
- Deprecate Directive 10 in `stage_2_red.py` which forced cross-runtime edge function tests into Node/Jest under `lib/utils/__tests__/`.
- Author unit tests for suitability gating and runtime boundary enforcement.

### 5. Context Pruning & Static Prefix Caching Optimization
- **Target Files:** `scripts/agent-resolve/agent_resolve/context.py`, `stage_2_red.py`, `stage_3_green.py`, `tests/test_stages.py`
- Reorder prompt sections to position static repository guidelines (`AGENTS.md`, `CONTEXT.md`) as a clean static prefix to maximize Gemini prompt cache hits (>70%).
- Omit unconditional full repository tree (`git ls-files`) dumps in Stage 2 and Stage 3 prompts, scoping context to target source/test files and immediate imports.
- Author unit tests verifying prompt composition and context pruning.

## Acceptance Criteria
- [ ] Stage 2 uses `PatchManifest` search/replace patching to author test additions instead of regenerating full test files.
- [ ] `extract_test_suite_names` check is removed from Stage 2.
- [ ] Stage 1 Planner deduplicates target test files and enforces a maximum of 1 primary test suite per architectural component.
- [ ] Stage 3 executes targeted `npx eslint --no-warn-ignored <target_src_files>` after type-checking and retries on lint failure with captured errors.
- [ ] Stage 3 prompt includes explicit directives prohibiting nested ternaries (>1 level) and enforcing helper extraction.
- [ ] Edge Function suitability gating flags issues touching `supabase/functions/` as requiring interactive Antigravity sessions rather than headless execution.
- [ ] Stage 2 and Stage 3 prompts omit full repository file tree dumps and structure static context for prompt caching.
- [ ] All unit tests pass cleanly via `npm run test:agent` and `npm run test:agent:all`.

## Out of Scope
- Adding Deno into the isolated test container (prevented cleanly via suitability gating).
- Production database mutations or frontend application modifications.
