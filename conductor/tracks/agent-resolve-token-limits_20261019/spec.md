# Specification: Prevent Prompt Token Blowout, Unbounded Jest Output & Cached Token Accounting

## 1. Overview & Problem Statement
During overnight headless execution of Issue #73 (PR #76, workflow run `38995806951`), `agent-resolve` halted in `stage_3_green` due to exceeding the 500,000-token budget:
```text
API call to model gemini-3.8-flash failed. Last error: Token budget exceeded: 1,059,071 tokens used (limit: 500,000)
Metrics: 1,059,071 total tokens (974,688 prompt, 32,582 candidates, 636,741 cached) across 7 API call(s)
```
Forensic analysis confirmed that `MAX_TOKENS_PER_ISSUE = 500,000` is adequate for 2-file bug fixes (~80k–150k tokens), but five compounding workflow defects led to prompt inflation:
1. `find_related_test_files` matched 32 frontend test files plus a python test file, appending all 34 suites directly into `target_test_files` and injecting ~365 KB (~100k tokens) into every Stage 2 and Stage 3 prompt.
2. In Stage 3, a compiler syntax error triggered execution of all 34 test suites, yielding 21 duplicate stack traces and untruncated ANSI logs injected into `last_error_context` (~200k tokens).
3. Cached tokens were counted at 100% weight, budget checks ran inside transient retry blocks, and `"500"` in `is_transient_error` matched `limit: 500,000`, causing retries of failed budget errors.
4. `supabase/functions/_shared/*.ts` modules had no Jest testing invariant, leaving shared normalization code unverified.
5. Resuming from dirty `.agent-state.json` checkpoints re-ingested polluted `target_test_files`.

## 2. Scope & Functional Requirements

### Phase 1: Separate `blast_radius_test_files` from `target_test_files` & Bound Discovery
- **Data Model (`models.py`, `vcs.py`):** Add `blast_radius_test_files: List[str] = Field(default_factory=list)` to `BlueprintPlan` and persist it in `.agent-state.json`.
- **Targeted Discovery (`context.py`):** In `find_related_test_files`, restrict pathspecs to Jest extensions (`*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx`), exclude `supabase/` and `e2e/`, match import boundaries (`/{stem}['"]` or `from.*{stem}`), and cap blast radius suites at 8 maximum (prioritizing same-directory suites).
- **Prompt Isolation (`stage_1_plan.py`, `stage_2_red.py`, `stage_3_green.py`):**
  - Stage 1 populates `blast_radius_test_files` without mutating `target_test_files`.
  - Stage 2 only reads, authors, type-checks, and executes `target_test_files`.
  - Stage 3 injects only `target_test_files` into `TESTS TO PASS` prompts, while running Jest against `target_test_files + blast_radius_test_files`.

### Phase 2: Stage 3 Fail-Fast Type-Check, Silent Jest Execution & Error Context Truncation
- **Fail-Fast Type Check (`stage_3_green.py`):** Run `npm run type-check` first. If `tc_code != 0`, skip running `npx jest` on that attempt and populate `last_error_context` solely with TypeScript errors.
- **Silent Jest Execution (`stage_3_green.py`):** Run Jest with `["--no-color", "--silent"]` to suppress ANSI formatting and console log/warn noise.
- **ANSI Stripping & Head/Tail Truncation (`stage_3_green.py`):** Strip ANSI escape codes via regex. Cap `last_error_context` at 8,000 characters using a head-and-tail split (first 4,000 characters and last 4,000 characters joined with a truncation marker).

### Phase 3: Discounted Cached Token Budget (25%), Pre-Call Guard & Status-Boundary Matching
- **Effective Token Accounting (`tracker.py`):**
  - Retain `MAX_TOKENS_PER_ISSUE = 500,000`.
  - Track `effective_tokens`: compute `uncached_tokens + int(0.25 * cached_tokens)` per API call.
  - Implement `check_budget()` raising `RuntimeError` when `effective_tokens > limit`.
  - Update `summary()` to report both `effective_tokens` and `total_tokens`.
- **Pre-Call Guard & Retry Isolation (`llm.py`):**
  - Check budget before every API call and retry attempt.
  - Narrow `try/except` in `call_gemini_with_fallback` so `record_usage()` runs outside the transient retry handler.
- **Status Boundary Regex (`llm.py`):** Replace bare substring checks in `is_transient_error` with `r"(?<![0-9,])(?:429|500|502|503|504)(?![0-9,])"`.

### Phase 4: Shared Edge Function (`supabase/functions/_shared/*.ts`) Verification Invariant
- **Target Test Path Guard (`stage_1_plan.py`):** Reject `supabase/**`, `e2e/**`, and non-Jest test paths in `blueprint.target_test_files`.
- **Shared Module Prompt Directives (`stage_1_plan.py`, `stage_2_red.py`):** Direct the Planner and Red Phase Executor to author Jest unit tests in `lib/**/__tests__/*.test.ts` importing from `@/supabase/functions/_shared/<module>`.
- **Headless Suitability (`context.py`):** In `is_issue_suitable_for_headless_agent`, reject Deno-only entrypoints while permitting pure-TS shared utility issues.

### Phase 5: Stateful Resumption Self-Healing & Issue #73 Reset Checklist
- **Checkpoint Self-Healing (`pipeline.py`):** On resuming from `.agent-state.json`, inspect `git diff-tree --no-commit-id --name-only -r <red_sha>`. Filter `target_test_files` to valid Jest test files modified in `<red_sha>` (falling back to first 3 if diff unavailable). Move overflow valid Jest tests into `blast_radius_test_files` (capped at 8), stripping non-test files.
- **Issue #73 Post-Merge Manual Reset:** Provide a manual verification checklist with exact git/gh commands to reset branch `origin/agent/issue-73` and close WIP PR #76 after merging.

### Phase 6: ADR Documentation & End-to-End Test Suite Verification
- **Architecture Record Update:** Update `docs/adr/0005-autonomous-nightly-agent-workflow.md` to document the distinction between `target_test_files` and `blast_radius_test_files`, 25% cached token discounting, fail-fast verification, and shared edge function Jest testing rules.
- **Verification:** Execute `npm run test:agent` and `npm run test:agent:all` ensuring all unit tests pass cleanly.

## 3. Acceptance Criteria
- [ ] `BlueprintPlan` includes `blast_radius_test_files: List[str] = Field(default_factory=list)` and `.agent-state.json` persists it.
- [ ] `find_related_test_files` only matches Jest test files (`*.test.ts(x)`, `*.spec.ts(x)` outside `supabase/` and `e2e/`), uses import-boundary matching (`/{stem}['"]` or `from.*{stem}`), and returns at most 8 suites (prioritizing same-directory suites).
- [ ] `stage_1_plan` populates `blueprint.blast_radius_test_files` without mutating `blueprint.target_test_files`, and rejects `supabase/**`, `e2e/**`, or non-Jest files in `blueprint.target_test_files`.
- [ ] `stage_2_red` only injects, authors, and runs `blueprint.target_test_files`.
- [ ] `stage_3_green` only injects `blueprint.target_test_files` into `TESTS TO PASS`, fails fast when `npm run type-check` fails (`tc_code != 0`, skipping `npx jest` on that retry), runs `npx jest --no-color --silent` across `target_test_files + blast_radius_test_files`, strips ANSI codes, and caps `last_error_context` at `8,000` characters.
- [ ] `TokenTracker` computes `effective_tokens` weighting `cached_content_token_count` at 25%, enforces `effective_tokens > limit` via `check_budget()` both pre-call and post-call (outside transient retry catch in `llm.py`), and reports both `effective_tokens` and raw `total_tokens` in `summary()`.
- [ ] `is_transient_error` uses numeric/status boundary regex matching so formatted numbers like `500,000` do not match `"500"`.
- [ ] `resolve_issue` self-heals `target_test_files` on resumption using `git diff-tree --no-commit-id --name-only -r <red_sha>`.
- [ ] `docs/adr/0005-autonomous-nightly-agent-workflow.md` is updated to document the distinction between `target_test_files` and `blast_radius_test_files`, the 25% cached token budget weight, Stage 3 fail-fast verification, and the `supabase/functions/_shared/*.ts` Jest testing rule.
- [ ] All unit tests pass via `npm run test:agent` and `npm run test:agent:all`.

## 4. Out of Scope
- Adding Deno test runtime or network access to the containerized `run_isolated_test` execution environment.
- Modifying production web application source files or Next.js app router components.
