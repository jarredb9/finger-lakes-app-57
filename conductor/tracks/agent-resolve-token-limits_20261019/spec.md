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

### Phase 1: Separate `blast_radius_test_files` from `target_test_files`, Bound Discovery & Prioritize Proximity
- **Data Model (`models.py`, `vcs.py`):**
  - Add `blast_radius_test_files: List[str] = Field(default_factory=list, description="Downstream test suites executed during Stage 3 verification but excluded from LLM prompts and Stage 2 authoring")` to `BlueprintPlan`.
  - Persist `blast_radius_test_files` in `.agent-state.json` in `vcs.py` (`preserve_failed_work`) and display it in the PR body (`update_or_create_pr`).
- **Targeted Discovery & Proximity Ranking (`context.py`):**
  - In `find_related_test_files(target_src_files: List[str]) -> List[str]`:
    - Restrict `git grep` pathspecs strictly to Jest extensions (`"**/*.test.ts"`, `"**/*.test.tsx"`, `"**/*.spec.ts"`, `"**/*.spec.tsx"`), excluding `supabase/` and `e2e/` and any non-TS/JS files.
    - Match module import boundaries with regex `r"/(?:{pattern})(?:\.[a-zA-Z]+)?['\"]"` and `from.*{pattern}`.
    - Generic Stem Qualification: For generic stems (`index`, `types`, `constants`, `utils`, `helpers`), match the relative directory or file path without extension (e.g. `/(?:lib/constants)(?:\.[a-zA-Z]+)?['\"]`) to prevent widespread cross-directory collisions.
    - Sort candidate suites by common ancestor directory depth descending (`len(os.path.commonpath([sf_dir, tf_dir]))`) so same-directory tests precede parent and sibling tests.
    - Cap discovered blast radius suites at a maximum of 8 files.
- **Prompt Isolation & Failure Boundaries (`stage_1_plan.py`, `stage_2_red.py`, `stage_3_green.py`):**
  - Stage 1 populates `blueprint.blast_radius_test_files` with discovered tests that are not in `blueprint.target_test_files`, without mutating `blueprint.target_test_files`.
  - Stage 2 only reads, authors, type-checks, and executes `blueprint.target_test_files`.
  - Stage 3 injects only `blueprint.target_test_files` into the `TESTS TO PASS` prompt section, while running Jest against `target_test_files + blast_radius_test_files`.
  - Blast Radius Failure Invariant: `blast_radius_test_files` act strictly as immutable regression guards in Stage 3. Stage 3 cannot modify them. Any blast-radius test failure is treated as a regression, injecting the failure diagnostic into `last_error_context` for production code self-correction.

### Phase 2: Stage 3 Fail-Fast Type-Check (Targeted & Regression), Silent Jest & Error Truncation
- **Fail-Fast Type Check (`stage_3_green.py`):**
  - Targeted Loop: Run `npm run type-check` first. If `tc_code != 0`, skip running `npx jest` on that attempt and populate `last_error_context` solely with TypeScript errors.
  - Regression Gate: In the Mandatory Full Regression Gate, run `npm run type-check` before `npm test`, failing fast on compilation errors before executing the full Jest suite.
- **Silent, No-Color Jest Execution (`stage_3_green.py`):**
  - Run targeted Jest verification with `["npx", "jest", "--no-color", "--silent"] + target_tests + blast_radius_tests` to suppress ANSI escape sequences and console noise from passing suites.
- **ANSI Stripping & Head/Tail Truncation (`stage_3_green.py`, `diagnostics.py`):**
  - Strip ANSI escape sequences using regex `r"\x1b\[[0-9;]*[a-zA-Z]"`.
  - Enforce a strict maximum cap of 8,000 characters on `last_error_context` (for both targeted verification and regression gate failures).
  - Truncation Algorithm: If stripped output exceeds 8,000 characters, retain the first 4,000 characters (head) and last 4,000 characters (tail), joined by `\n\n... [TRUNCATED {total - 8000} CHARS OF VERIFICATION OUTPUT] ...\n\n`. Outputs $\le 8,000$ characters remain intact.

### Phase 3: Discounted Cached Token Budget (25%), Pre-Call Guard & Status-Boundary Matching
- **Effective Token Accounting (`tracker.py`):**
  - Retain `MAX_TOKENS_PER_ISSUE = 500,000`.
  - Add `effective_tokens: int = 0` to `TokenTracker`.
  - On each `record_usage(usage_metadata)`, compute:
    ```python
    uncached_tokens = max(0, t_tokens - cached)
    effective_call_tokens = uncached_tokens + int(0.25 * cached)
    self.effective_tokens += effective_call_tokens
    ```
  - Implement `check_budget() -> None` raising `RuntimeError(f"Token budget exceeded: {self.effective_tokens:,} effective tokens used ({self.total_tokens:,} raw total, limit: {limit:,})")` when `self.effective_tokens > limit`. Call `check_budget()` inside `record_usage()`.
  - Update `summary()` to format dual metrics:
    `"{self.effective_tokens:,} effective tokens / {self.total_tokens:,} raw total ({self.prompt_tokens:,} prompt [{self.cached_tokens:,} cached @ 25%], {self.candidate_tokens:,} candidates) across {self.call_count} API call(s)"`.
- **Pre-Call Guard & Retry Handler Isolation (`llm.py`):**
  - Call `if token_tracker: token_tracker.check_budget()` before initiating every Gemini API call and before each backoff retry attempt.
  - Narrow the transient retry `try/except` block strictly to `client.models.generate_content(...)` and response text parsing, ensuring `token_tracker.record_usage()` runs outside the transient retry handler.
- **Status Boundary Regex Matching (`llm.py`):**
  - Replace bare numeric substring checks (`"429"`, `"500"`, `"502"`, `"503"`, `"504"`) in `is_transient_error` with status-boundary regex `r"(?<![0-9,])(?:429|500|502|503|504)(?![0-9,])"`. Formatted tokens like `500,000` or line numbers like `5020` will not trigger false-positive retries.

### Phase 4: Shared Edge Function (`supabase/functions/_shared/*.ts`) Verification Invariant & Planner Self-Correction
- **Target Test Path Guard & Self-Correction (`stage_1_plan.py`):**
  - Validate `blueprint.target_test_files`: filter out paths under `supabase/**`, `e2e/**`, and non-Jest test files (`not (p.endswith('.test.ts') or p.endswith('.test.tsx') or p.endswith('.spec.ts') or p.endswith('.spec.tsx'))`) with a logged warning.
  - Self-Correction Loop: If `blueprint.target_test_files` becomes empty after filtering, run an internal 2-attempt self-correction loop in `stage_1_plan.py` feeding back explicit path instructions: "Target test files must be Jest test files under lib/ or components/ and outside supabase/ and e2e/." If attempts are exhausted without valid target test files, raise a validation error.
- **Shared Module Prompt Directives (`stage_1_plan.py`, `stage_2_red.py`):**
  - Add explicit directives to Planner and Red Phase Executor prompts: when a target source file is a pure-TypeScript shared module under `supabase/functions/_shared/*.ts`, its unit tests MUST be authored in a Jest test file under `lib/` (e.g. `lib/utils/__tests__/<name>.test.ts`) importing from `@/supabase/functions/_shared/<module>`.
- **Headless Suitability Check (`context.py`):**
  - In `is_issue_suitable_for_headless_agent`, flag an issue as unsuitable (`False, reason`) if issue text references Deno runtime entrypoints (`Deno.serve`, `jsr:`, `https://deno.land`, `deno.json`) or non-shared Edge Function paths (`supabase/functions/<name>/index.ts`).
  - Permit issues whose Edge Function references are strictly confined to pure-TypeScript shared modules under `supabase/functions/_shared/*`.

### Phase 5: Resumption Checkpoint Self-Healing & VCS State Persistence
- **Resumption `target_test_files` Self-Healing (`pipeline.py`):**
  - When loading `.agent-state.json` during Stateful Iterative Resumption:
    - Query files modified in `red_phase_commit_sha` via `git diff-tree --no-commit-id --name-only -r <red_sha>`.
    - Filter `target_test_files` to valid Jest test files modified in `<red_sha>` (falling back to the first 3 valid Jest test files if diff is empty/unavailable).
    - Move remaining valid Jest test files from the checkpoint's `target_test_files` into `blast_radius_test_files`.
    - Merge with any pre-existing `blast_radius_test_files` in the checkpoint, deduplicate, strip non-Jest files (e.g. `.py`), and cap at 8 suites.
  - Pass `blast_radius_test_files` when instantiating `BlueprintPlan` on both clean resumption and autonomous checkpoint invalidation rollback.
- **VCS Checkpoint & PR Persistence (`vcs.py`):**
  - Update `preserve_failed_work` to serialize `state_data["blast_radius_test_files"] = blueprint.blast_radius_test_files if blueprint else []` into `.agent-state.json`.
  - Update `update_or_create_pr` to record discovered blast radius suites in the Draft PR summary.
- **Issue #73 Post-Merge Manual Reset:**
  - Document operational checklist: once merged to `main`, delete remote branch `origin/agent/issue-73`, close WIP PR #76, and re-apply `agent:resolve` to Issue #73 for a clean run.

### Phase 6: ADR Documentation & End-to-End Test Suite Verification
- **Architecture Decision Record Update:**
  - Update `docs/adr/0005-autonomous-nightly-agent-workflow.md` documenting:
    - Domain separation of `target_test_files` vs `blast_radius_test_files`.
    - 25% cached token budgeting rule and dual summary reporting.
    - Stage 3 fail-fast compiler checks (targeted and full regression) and 8k character truncation.
    - Pure-TS `supabase/functions/_shared/*.ts` Jest testing rule via `@/supabase/functions/_shared/*`.
  - Maintain `CONTEXT.md` cleanliness (no agent implementation details in the application domain glossary).
- **Dual-Suite Verification:**
  - Execute `npm run test:agent` ensuring all modular unit tests pass.
  - Execute `npm run test:agent:all` ensuring both modular and legacy regression test suites pass cleanly.

## 3. Acceptance Criteria
- [ ] `BlueprintPlan` includes `blast_radius_test_files: List[str] = Field(default_factory=list)` and `.agent-state.json` persists it via `preserve_failed_work`.
- [ ] `find_related_test_files` only matches Jest test files (`*.test.ts(x)`, `*.spec.ts(x)` outside `supabase/` and `e2e/`), qualifies generic stems (`index`, `types`, etc.) using relative paths, matches import boundaries (`/(?:{pattern})(?:\.[a-zA-Z]+)?['\"]` and `from.*{pattern}`), sorts by common ancestor directory depth descending, and caps results at 8 suites.
- [ ] `stage_1_plan` populates `blueprint.blast_radius_test_files` without mutating `blueprint.target_test_files`, sanitizes invalid test paths, and runs a 2-attempt self-correction loop if `target_test_files` becomes empty.
- [ ] `stage_2_red` only injects, authors, type-checks, and runs `blueprint.target_test_files`.
- [ ] `stage_3_green` only injects `blueprint.target_test_files` into `TESTS TO PASS`, fails fast when `npm run type-check` fails (`tc_code != 0`, skipping `npx jest` on that attempt), runs `npx jest --no-color --silent` across `target_test_files + blast_radius_test_files`, runs `npm run type-check` before `npm test` in the regression gate, strips ANSI codes, and caps `last_error_context` at 8,000 characters using head/tail split.
- [ ] `TokenTracker` computes `effective_tokens` weighting `cached_content_token_count` at 25%, enforces `effective_tokens > limit` via `check_budget()` both pre-call and post-call (outside transient retry catch in `llm.py`), and reports dual metrics in `summary()`.
- [ ] `is_transient_error` uses status boundary regex matching `r"(?<![0-9,])(?:429|500|502|503|504)(?![0-9,])"` so numbers like `500,000` or `5020` do not trigger transient retries.
- [ ] `resolve_issue` self-heals `target_test_files` and `blast_radius_test_files` on resumption using `git diff-tree --no-commit-id --name-only -r <red_sha>`, merging and capping blast radius at 8.
- [ ] `is_issue_suitable_for_headless_agent` flags Deno runtime entrypoints while permitting pure-TS `supabase/functions/_shared/*.ts` issues.
- [ ] `docs/adr/0005-autonomous-nightly-agent-workflow.md` is updated with token budget discounting, test isolation, fail-fast verification, and edge function testing invariants.
- [ ] All unit tests pass via `npm run test:agent` and `npm run test:agent:all`.

## 4. Out of Scope
- Adding Deno test runtime or network access to the containerized `run_isolated_test` execution environment.
- Modifying production web application source files or Next.js app router components.
