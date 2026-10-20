# Implementation Plan — Phase 4, Task 1: Write failing unit tests for Edge Function shared module prompt directives, target path guards, and planner self-correction loop (TDD Red phase)

## 1. Overview & Objective
Establish authoritative failing unit tests for Phase 4 of `agent-resolve-token-limits_20261019`. This Red phase establishes regression guards and behavioral specifications for:
1. **Target Test Path Sanitization (`stage_1_plan.py`):** `stage_1_plan` validates `blueprint.target_test_files`, filtering out paths under `supabase/**`, `e2e/**`, and non-Jest test files (`not (p.endswith('.test.ts') or p.endswith('.test.tsx') or p.endswith('.spec.ts') or p.endswith('.spec.tsx'))`) with logged warnings, while preserving valid Jest test files under `lib/` and `components/`.
2. **Planner Self-Correction Loop (`stage_1_plan.py`):** If `blueprint.target_test_files` becomes empty after sanitization, `stage_1_plan` executes an internal 2-attempt self-correction loop feeding back explicit path instructions: `"Target test files must be Jest test files under lib/ or components/ and outside supabase/ and e2e/."`. If attempts are exhausted without valid target test files, it raises a validation `ValueError`.
3. **Edge Function Shared Module Prompt Directives (`stage_1_plan.py`, `stage_2_red.py`):** Stage 1 Planner and Stage 2 Red Phase Executor prompts include explicit directives mandating that pure-TypeScript shared modules under `supabase/functions/_shared/*.ts` must have unit tests authored under `lib/**/__tests__/*.test.ts` importing via `@/supabase/functions/_shared/<module>`.
4. **Headless Suitability Evaluation (`context.py`):** `is_issue_suitable_for_headless_agent` permits pure-TypeScript shared modules under `supabase/functions/_shared/*` while flagging issues referencing Deno runtime entrypoints (`Deno.serve`, `jsr:`, `https://deno.land`, `deno.json`) and non-shared Edge Function paths (`supabase/functions/<name>/index.ts` or `supabase/functions/<name>/`).

As a strict TDD Red phase, all authored tests must fail against the current unadapted codebase and pass cleanly upon completion of Phase 4 Task 2 (Green phase).

---

## 2. Target Files & Semantic Insertion Anchors

### 2.1 Stage 1 Planner & Stage 2 Red Phase Unit Tests
- **Path:** `scripts/agent-resolve/tests/test_stages.py`
- **Action:** Modify existing test suite.
- **Semantic Insertion Anchors:**
  1. Inside `TestStage1Plan` class, immediately after `test_stage_1_populates_blast_radius_without_mutating_target_test_files` (line 332).
  2. Inside `TestStage2Red` class, immediately after `test_stage_2_only_interacts_with_target_test_files` (line 604).
- **Target Additions in `TestStage1Plan`:**
  - `test_stage_1_sanitizes_invalid_paths_from_target_test_files`:
    - Simulates LLM returning a `BlueprintPlan` with mixed target test paths:
      - Invalid paths: `"supabase/functions/_shared/__tests__/geo.test.ts"`, `"e2e/winery-flow.spec.ts"`, `"lib/utils/helper.ts"` (non-test).
      - Valid path: `"lib/utils/__tests__/geo.test.ts"`.
    - Asserts that post-planning `blueprint.target_test_files` retains only `["lib/utils/__tests__/geo.test.ts"]`.
    - Asserts no self-correction retry is triggered when at least one valid target test file remains.
  - `test_stage_1_triggers_self_correction_when_target_test_files_filtered_empty`:
    - Mock `call_gemini_with_fallback` across sequential attempts:
      - Attempt 1: returns blueprint with `target_test_files=["supabase/functions/places.test.ts"]` (all filtered out).
      - Attempt 2: returns blueprint with `target_test_files=["lib/utils/__tests__/places.test.ts"]`, `target_src_files=["supabase/functions/_shared/places.ts"]`.
    - Asserts `call_gemini_with_fallback` is invoked twice (`call_count == 2`).
    - Asserts the attempt 2 prompt includes the corrective instruction: `"Target test files must be Jest test files under lib/ or components/ and outside supabase/ and e2e/."`.
    - Asserts final returned blueprint has `target_test_files == ["lib/utils/__tests__/places.test.ts"]`.
  - `test_stage_1_raises_validation_error_when_self_correction_attempts_exhausted`:
    - Mock `call_gemini_with_fallback` returning invalid target test files (`["supabase/functions/test.ts"]`) on all attempts.
    - Asserts `with self.assertRaises(ValueError) as ctx: stage_1_plan(...)`.
    - Asserts `call_gemini_with_fallback` stops after exactly 2 attempts.
    - Asserts exception message indicates validation failure for target test files under `supabase/` or `e2e/`.
  - `test_stage_1_prompt_includes_shared_edge_function_jest_directives`:
    - Calls `stage_1_plan(...)` with standard mock blueprint.
    - Inspects prompt string passed to `call_gemini_with_fallback`.
    - Asserts prompt contains directives for Edge Function shared modules:
      `"supabase/functions/_shared"`, `"@/supabase/functions/_shared"`, and `"lib/"`.
- **Target Additions in `TestStage2Red`:**
  - `test_stage_2_prompt_includes_shared_edge_function_jest_directives`:
    - Calls `stage_2_red(...)` with mock type-check exit 0 and valid red Jest failure.
    - Inspects prompt string passed to `call_gemini_with_fallback`.
    - Asserts prompt contains directives instructing tests for pure-TS shared modules to import via `"@/supabase/functions/_shared"` and avoid authoring under `"supabase/"` or `"e2e/"`.

### 2.2 Headless Suitability Unit Tests
- **Path:** `scripts/agent-resolve/tests/test_context.py`
- **Action:** Modify existing test suite.
- **Semantic Insertion Anchor:** Inside `TestIsIssueSuitableForHeadlessAgent` class, immediately after `test_approves_standard_headless_suitable_issues` (line 393).
- **Target Additions:**
  - `test_flags_deno_runtime_entrypoints`:
    - Tests issue titles and bodies containing Deno runtime symbols:
      `"Deno.serve"`, `"deno.serve"`, `"jsr:@supabase/functions-js"`, `"https://deno.land/std"`, `"deno.json"`.
    - Asserts `is_issue_suitable_for_headless_agent` returns `(False, reason)`.
    - Asserts `reason` contains `"Deno runtime entrypoint"`.
  - `test_flags_non_shared_edge_function_paths`:
    - Tests issue referencing full Edge Function server handlers:
      `"supabase/functions/enrich-winery/index.ts"`, `"supabase/functions/places/"`, `"supabase/functions/sync/handler.ts"`.
    - Asserts `is_issue_suitable_for_headless_agent` returns `(False, reason)`.
    - Asserts `reason` contains `"non-shared Edge Function"` or `"Deno runtime entrypoint"`.
  - `test_permits_pure_typescript_shared_edge_function_modules`:
    - Tests issue referencing shared pure-TS modules:
      - Title: `"Refactor coordinate standardizer in supabase/functions/_shared/winery.ts"`
      - Body: `"Add altitude clamp to winery normalization in supabase/functions/_shared/winery.ts without modifying Deno runtime entrypoints."`
    - Asserts `is_issue_suitable_for_headless_agent` returns `(True, "")`.
  - `test_flags_deno_runtime_even_if_shared_edge_function_present`:
    - Tests issue mentioning both `supabase/functions/_shared/utils.ts` and `Deno.serve((req) => ...)` or `supabase/functions/api/index.ts`.
    - Asserts `is_issue_suitable_for_headless_agent` returns `(False, reason)`.
    - Asserts `reason` identifies the Deno runtime entrypoint.

---

## 3. Interfaces, Types & Exported Signatures

### 3.1 Target Path Sanitization & Validation Helper (`agent_resolve/stages/stage_1_plan.py`)
```python
def is_valid_target_test_file(path: str) -> bool:
    """
    Validates whether a path is an acceptable Jest target test file.
    Rejects paths in supabase/**, e2e/**, or non-Jest extensions.
    """
    ...

def sanitize_target_test_files(target_test_files: List[str]) -> Tuple[List[str], List[str]]:
    """
    Splits target test files into (valid_tests, invalid_tests).
    Valid paths must:
    1. Not reside under supabase/ or e2e/ (checked via prefix and segment containment).
    2. End with valid Jest test extensions: (.test.ts, .test.tsx, .spec.ts, .spec.tsx).
    """
    ...
```

### 3.2 Stage 1 Planner Signature & Self-Correction Contract (`agent_resolve/stages/stage_1_plan.py`)
```python
def stage_1_plan(
    client: Any,
    issue_number: int,
    issue_title: str,
    issue_body: str,
    token_tracker: TokenTracker,
    negative_feedback: str = "",
    diagnostic_result: Optional[DiagnosticResult] = None,
) -> BlueprintPlan:
    """
    Generates task-plan.md and structured file manifest using Planner model.
    Runs an internal 2-attempt self-correction loop if target_test_files becomes empty
    after sanitizing supabase/**, e2e/**, and non-Jest paths.
    Raises ValueError if 2 attempts are exhausted without valid target test files.
    """
    ...
```

### 3.3 Stage 2 Red Phase Signature (`agent_resolve/stages/stage_2_red.py`)
```python
def stage_2_red(
    client: Any,
    issue_number: int,
    issue_title: str,
    blueprint: BlueprintPlan,
    token_tracker: TokenTracker,
    new_src_files: Optional[List[str]] = None,
    initial_error_context: str = "",
) -> None:
    """
    Authors failing unit/component tests in target_test_files.
    Directs executor to author Jest tests under lib/ using path alias
    @/supabase/functions/_shared/<module> for pure-TS Edge Function shared modules.
    """
    ...
```

### 3.4 Headless Suitability Signature & Detection Patterns (`agent_resolve/context.py`)
```python
DENO_ENTRYPOINT_PATTERNS: tuple[str, ...] = (
    "deno.serve",
    "jsr:",
    "https://deno.land",
    "deno.json",
)

NON_SHARED_EDGE_FUNCTION_REGEX: re.Pattern[str] = re.compile(
    r"supabase/functions/(?!_shared(?:/|$))[\w.-]+"
)

def is_issue_suitable_for_headless_agent(
    issue_title: str,
    issue_body: str
) -> Tuple[bool, str]:
    """
    Evaluates whether an issue is suitable for headless overnight resolution.
    Permits pure-TypeScript shared modules under supabase/functions/_shared/*.
    Flags Deno runtime entrypoints and non-shared Edge Function paths.
    """
    ...
```

### 3.5 TypeScript Testing Invariant (Reference Pattern)
When testing shared modules in Jest, tests import through the configured path alias `@/supabase/functions/_shared/<module>`:
```typescript
// lib/utils/__tests__/winery-shared.test.ts
import { standardizeCoordinates } from '@/supabase/functions/_shared/winery';

describe('standardizeCoordinates', () => {
  it('clamps coordinates to valid ranges', () => {
    const result = standardizeCoordinates(42.8, -76.9);
    expect(result).toEqual({ latitude: 42.8, longitude: -76.9 });
  });
});
```

---

## 4. Behavioral Logic, Conditions & Edge Cases

1. **Path Sanitization Logic (`stage_1_plan.py`):**
   - Normalize path separators (`path.replace("\\", "/").lstrip("./")`).
   - Rejection condition:
     ```python
     is_invalid = (
         norm_path.startswith(("supabase/", "e2e/"))
         or "/supabase/" in norm_path
         or "/e2e/" in norm_path
         or not norm_path.endswith((".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"))
     )
     ```
   - Valid items are retained in `blueprint.target_test_files`.
   - Invalid items are stripped and logged: `log(f"Warning: Removed invalid target test file: {tf}")`.

2. **Planner Self-Correction Loop (`stage_1_plan.py`):**
   - Maximum planner attempts: `max_attempts = 2`.
   - On attempt 1:
     - Generate initial `blueprint = call_gemini_with_fallback(...)`.
     - Sanitize `blueprint.target_test_files`.
     - If `blueprint.target_test_files` is non-empty, loop terminates successfully.
   - If `blueprint.target_test_files` is empty:
     - Set corrective error instruction:
       ```python
       correction_instruction = (
           "Target test files must be Jest test files under lib/ or components/ "
           "and outside supabase/ and e2e/."
       )
       ```
     - Inject `correction_instruction` into the attempt 2 prompt under `### PREVIOUS ARCHITECTURAL ATTEMPT FAILED WITH COMPILER/RED-PHASE ERRORS:`.
     - On attempt 2: invoke `call_gemini_with_fallback(...)` with updated prompt.
     - Re-sanitize `blueprint.target_test_files`.
     - If still empty after attempt 2:
       `raise ValueError("No valid target test files specified in architectural blueprint after self-correction: all target test files were invalid (under supabase/, e2e/, or non-Jest).")`.

3. **Stage 1 & Stage 2 Prompt Directives:**
   - In `stage_1_plan.py`:
     ```text
     EDGE FUNCTION SHARED MODULE TESTING INVARIANT:
     When target source files include pure-TypeScript shared modules under 'supabase/functions/_shared/*.ts', their unit tests MUST be authored as Jest test files under 'lib/' (e.g. 'lib/utils/__tests__/<name>.test.ts') importing from '@/supabase/functions/_shared/<module>'. Never plan tests under supabase/ or e2e/.
     ```
   - In `stage_2_red.py`:
     ```text
     EDGE FUNCTION SHARED MODULE TESTING INVARIANT:
     When target source files include pure-TypeScript shared modules under 'supabase/functions/_shared/*.ts', import them in your Jest unit tests using path alias '@/supabase/functions/_shared/<module>'. Never author tests under supabase/ or e2e/.
     ```

4. **Headless Suitability Logic (`context.py`):**
   - Normalize text: `text = f"{issue_title}\n{issue_body}".lower()`.
   - Deno runtime symbol check:
     - `if any(p in text for p in ["deno.serve", "jsr:", "https://deno.land", "deno.json"]): reasons.append("Deno runtime entrypoint")`.
   - Edge Function non-shared path check:
     - Detect references to `supabase/functions/` that are NOT `supabase/functions/_shared/`.
     - Using regex `re.search(r"supabase/functions/(?!_shared(?:/|$|\.))[\w.-]+", text)`:
       - Matches: `supabase/functions/enrich/index.ts`, `supabase/functions/stripe`, `supabase/functions/auth/callback.ts`.
       - Does NOT match: `supabase/functions/_shared/winery.ts`, `supabase/functions/_shared/types.ts`.
     - If matched: `reasons.append("non-shared Edge Function path")`.
   - Combined suitability:
     - If `reasons`: return `(False, "; ".join(reasons))`.
     - Else: return `(True, "")`.

---

## 5. Execution Verification Protocol

Execute unit tests to confirm that newly authored Phase 4 tests fail cleanly against the current unadapted codebase (TDD Red phase):

1. **Verify `test_stages.py` Red Phase:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_stages.py
   ```
   *Expected Failure:*
   - `AssertionError` in `test_stage_1_sanitizes_invalid_paths_from_target_test_files` (invalid paths currently retained in `target_test_files`).
   - `AssertionError` in `test_stage_1_triggers_self_correction_when_target_test_files_filtered_empty` (self-correction loop not yet implemented; call count is 1 instead of 2).
   - `AssertionError: ValueError not raised` in `test_stage_1_raises_validation_error_when_self_correction_attempts_exhausted`.
   - `AssertionError` in `test_stage_1_prompt_includes_shared_edge_function_jest_directives` and `test_stage_2_prompt_includes_shared_edge_function_jest_directives` (prompt text lacks shared module directives).

2. **Verify `test_context.py` Red Phase:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_context.py
   ```
   *Expected Failure:*
   - `AssertionError: True is not false` in `test_flags_deno_runtime_entrypoints` (Deno keywords not currently evaluated).
   - `AssertionError: True is not false` in `test_flags_non_shared_edge_function_paths`.

3. **Verify Full Modular Agent Test Suite Status:**
   ```bash
   npm run test:agent
   ```
   *Expected Status:* Pre-existing Phase 1, Phase 2, and Phase 3 tests pass; newly added Phase 4 tests fail cleanly with expected assertion errors.

---

## 6. Post-Execution Commit & Git Notes Protocol

1. **Commit Red Phase Test Changes (requires `BypassSandbox: true`):**
   ```bash
   git add scripts/agent-resolve/tests/test_stages.py scripts/agent-resolve/tests/test_context.py
   git commit -m "test(agent-resolve): add failing unit tests for Edge Function shared module prompt directives, target path guards, and planner self-correction loop"
   ```

2. **Attach Git Note (requires `BypassSandbox: true`):**
   ```bash
   git notes add -m "Task: Write failing unit tests for Edge Function shared module prompt directives, target path guards, and planner self-correction loop (TDD Red phase)
   Summary: Authored failing unit test cases across test_stages.py and test_context.py asserting Stage 1 Planner target test path sanitization (filtering supabase/**, e2e/**, and non-Jest paths), 2-attempt self-correction loop with path directives, Edge Function shared module prompt directives for Jest authoring via @/supabase/functions/_shared/<module>, and context headless suitability checks distinguishing pure-TS shared functions from Deno runtime entrypoints.
   Files: scripts/agent-resolve/tests/test_stages.py, scripts/agent-resolve/tests/test_context.py
   Rationale: Establishes strict TDD Red phase regression guards ensuring Stage 1 Planner prevents invalid test file paths from corrupting downstream stages, prompts valid Jest authoring for shared edge functions, and properly bounds headless issue intake before green phase implementation." $(git log -1 --format="%H")
   ```

3. **Update Track Plan & Commit (`conductor/tracks/agent-resolve-token-limits_20261019/plan.md`):**
   Record the commit SHA on Phase 4 Task 1 in `plan.md` and commit with:
   `conductor(plan): Mark task 'Write failing unit tests for Edge Function shared module prompt directives, target path guards, and planner self-correction loop (TDD Red phase)' as complete`.
