# Specification: Agent-Resolve Quality Hardening & Token Optimization

## Overview
Quality hardening and performance optimization of the autonomous `agent-resolve` pipeline based on forensic analysis of Issue #73 / PR #83 and requirements in Issue #84. This track eliminates Stage 2 token blowout (switching from full-file rewrites to search/replace patches), prevents duplicated unit test suites in Stage 1, adds targeted ESLint gating and code complexity rules in Stage 3, sets clean architectural runtime boundaries for Deno Edge Functions, and prunes prompt context to maximize static prefix prompt caching.

## Modular Improvement Phases

### 1. Stage 2 (Red Phase) Patch-Based Test Authoring & Unified Patch Engine
- **Target Files:** `scripts/agent-resolve/agent_resolve/stages/stage_2_red.py`, `models.py`, `patch_engine.py`, `tests/test_stages.py`
- Define `TestPatchManifest` schema in `models.py` containing `patches: List[PatchChunk]` and `source_stubs: List[SourceStubEntry] = []`.
- Replace full-file `TestFileManifest` in `stage_2_red.py` with `TestPatchManifest`.
- Apply `source_stubs` first to disk and stage them.
- Generalize `apply_patch_manifest` in `patch_engine.py` to accept `new_files` (or `new_test_files`) so brand new test files can be authored with `search_block = ""`.
- Enforce strict allowed files: pass `allowed_files = target_tests` to `apply_patch_manifest` during Stage 2, preventing the LLM from accidentally mutating production source code during the Red phase.
- Add working tree state management to the Stage 2 retry loop: at the beginning of each attempt, revert `target_test_files` to git baseline and clean up uncommitted source stubs from prior failed attempts to prevent dirty edits from poisoning subsequent search/replace matching.
- Deprecate and remove the brittle `extract_test_suite_names` preflight check, as search/replace patches intrinsically preserve unedited describe blocks.
- Author unit tests in `tests/test_stages.py` verifying patch application, source stub handling, allowed file constraints, and retry reversion in Stage 2.

### 2. Stage 1 Target Test Cohesion & Deduplication
- **Target Files:** `scripts/agent-resolve/agent_resolve/stages/stage_1_plan.py`, `context.py`, `tests/test_stages.py`, `tests/test_context.py`
- Implement deterministic test deduplication in `stage_1_plan.py` / `context.py`:
  - Group candidate test files by base component stem (`<stem>.*.test.ts*` vs `<stem>.test.ts*`).
  - For each component stem, retain only the single most specialized suite (e.g. `.persist.test.ts`, `.enrichment.test.ts`) in `blueprint.target_test_files`.
  - Demote unselected generic fallback suites (e.g. `.test.ts`) into `blueprint.blast_radius_test_files` (deduplicated, capped at `MAX_BLAST_RADIUS_TESTS = 8`), ensuring full regression coverage without duplicate test authoring.
- Add prompt directive in Stage 1 Planner: *"Select only the single most cohesive test file for each modified source file. Do not duplicate identical unit tests across multiple test files."*
- Author unit tests in `tests/test_stages.py` and `tests/test_context.py` validating component stem grouping, specialized suite selection, and blast radius demotion.

### 3. Stage 3 (Green Phase) Targeted Linter Gate & Code Readability Invariants
- **Target Files:** `eslint.config.mjs`, `lib/utils/adapters/google-v1.ts`, `components/TripCardSimplePresentational.tsx`, `scripts/agent-resolve/agent_resolve/stages/stage_3_green.py`, `tests/test_stages.py`
- Add `"no-nested-ternary": "error"` to `eslint.config.mjs`.
- Refactor existing nested ternaries in `lib/utils/adapters/google-v1.ts` and `components/TripCardSimplePresentational.tsx` so existing files pass cleanly.
- In `stage_3_green.py`, add targeted ESLint verification executing `npx eslint --no-warn-ignored <target_src_files>` right after `npm run type-check` passes.
- On lint failure (exit code != 0), capture stdout and stderr, sanitize and truncate diagnostic output using `truncate_error_context()`, assign to `last_error_context`, and trigger the attempt retry loop.
- Add explicit code hygiene directive to the Stage 3 Green prompt:
  *"CODE HYGIENE & COMPLEXITY: Avoid nested ternary operators (>1 level). When resolving conditional state with multiple fallbacks, extract the logic into a pure, well-named helper function."*
- Author unit tests in `tests/test_stages.py` verifying ESLint execution, retry triggers, and truncated diagnostic handling.

### 4. Edge Function Runtime Boundary & Suitability Gate
- **Target Files:** `scripts/agent-resolve/agent_resolve/context.py`, `pipeline.py`, `stages/stage_1_plan.py`, `stages/stage_2_red.py`, `tests/test_context.py`, `tests/test_pipeline.py`
- Update `is_issue_suitable_for_headless_agent` in `context.py` to flag any issue touching `supabase/functions/` (including `_shared/`) as unsuitable for headless overnight runs due to the Deno runtime boundary (`False, "Edge Function modification (supabase/functions/) requires Deno runtime"`).
- In `pipeline.py`, enforce suitability as a hard execution gate:
  - Check `is_issue_suitable_for_headless_agent` upfront; if unsuitable, post a comment via `gh_cli` stating that the issue requires human-in-the-loop Antigravity CLI session due to Edge Function / platform complexity, and exit cleanly without error.
  - Add secondary verification after Stage 0 diagnostics: if verified target files include any path under `supabase/functions/`, halt execution, post comment, and exit cleanly to catch Edge Function issues that omitted path keywords in the title/body.
- Deprecate Directive 10 in `stage_1_plan.py` and `stage_2_red.py` (which previously forced Edge Function tests into Node/Jest under `lib/utils/__tests__/`).
- Author unit tests in `tests/test_context.py` and `tests/test_pipeline.py` asserting hard gating, comment posting, and runtime boundary enforcement.

### 5. Context Pruning & Static Prefix Caching Optimization
- **Target Files:** `scripts/agent-resolve/agent_resolve/context.py`, `stage_1_plan.py`, `stage_2_red.py`, `stage_3_green.py`, `tests/test_stages.py`, `tests/test_context.py`
- Update `get_project_context(include_tree: bool = False)` in `context.py` (default `False`). Stage 1 explicitly passes `include_tree = True` or calls `get_repository_tree()`; Stages 2 and 3 omit `get_repository_tree()` entirely.
- Restructure prompts across Stages 1, 2, and 3:
  - Position static repository guidelines (`CONTEXT.md`, `AGENTS.md`) and immutable stage role instructions at byte 0 of the prompt.
  - Position dynamic context (issue number, issue title, issue body, blueprint, snippets, last error context) after the static prefix.
  - Maximize Gemini prompt cache hit rates (>70%) across retry attempts and consecutive stages.
- Author unit tests verifying prompt composition, prefix positioning, and repository tree exclusion in Stages 2 and 3.

### 6. Semantic Diagnostic Filtering & Stack Trace Pruning
- **Target Files:** `scripts/agent-resolve/agent_resolve/diagnostics.py`, `stage_3_green.py`, `docs/adr/0005-autonomous-nightly-agent-workflow.md`, `tests/test_diagnostics.py`
- Enhance `truncate_error_context()` in `diagnostics.py` with universal negative stack frame filtering:
  - Strip internal framework stack frames matching `node_modules/` (including container `/app/node_modules/`) and `internal/` / `node:internal/`.
  - Collapse 3+ consecutive newlines down to 2 (`\n\n`) to prevent sparse prompt whitespace.
  - Preserve all error descriptions, assertion diffs, code frames, user-space stack frames, TypeScript compiler diagnostics, and ESLint outputs.
  - Lower the default truncation cap from 8,000 characters to 4,000 characters (2,000 head / 2,000 tail).
- Update Section 7 of `docs/adr/0005-autonomous-nightly-agent-workflow.md` to reflect the 4,000-character truncation invariant and stack frame pruning.
- Author unit tests in `tests/test_diagnostics.py` asserting negative frame filtering, retention of TypeScript and ESLint diagnostics, assertion diff preservation, newline collapsing, and the 4,000 character limit.

## Acceptance Criteria
- [ ] `TestPatchManifest` schema is defined with `patches: List[PatchChunk]` and `source_stubs: List[SourceStubEntry] = []`.
- [ ] Stage 2 uses `TestPatchManifest` search/replace patching with `allowed_files = target_tests` and resets working tree before each attempt.
- [ ] `extract_test_suite_names` check is removed from Stage 2.
- [ ] Stage 1 Planner deduplicates target test files by component stem, keeps the most specialized suite, and demotes generic suites to blast radius.
- [ ] `"no-nested-ternary": "error"` is active in `eslint.config.mjs`, and pre-existing nested ternaries in target source files are cleaned up.
- [ ] Stage 3 executes targeted `npx eslint --no-warn-ignored <target_src_files>` after type-checking, retrying on lint failure with truncated diagnostics.
- [ ] Stage 3 prompt includes explicit directives prohibiting nested ternaries (>1 level) and enforcing helper extraction.
- [ ] Edge Function suitability gating flags issues touching `supabase/functions/` as requiring interactive Antigravity sessions and hard-halts headless execution in `pipeline.py` with an informative GitHub comment.
- [ ] Stage 2 and Stage 3 prompts omit full repository file tree dumps and structure static context at byte 0 for prompt caching.
- [ ] `truncate_error_context` negatively prunes `node_modules/` and `internal/` stack frames, collapses consecutive newlines, preserves TypeScript/ESLint/assertion diffs, and enforces a 4,000 character ceiling.
- [ ] Section 7 of `docs/adr/0005-autonomous-nightly-agent-workflow.md` is updated to reflect the 4,000 character cap and stack trace pruning.
- [ ] All unit tests pass cleanly via `npm run test:agent` and `npm run test:agent:all`.

## Out of Scope
- Adding Deno into the isolated test container (prevented cleanly via suitability hard gating).
- Modifying production database migrations or frontend application business logic.
