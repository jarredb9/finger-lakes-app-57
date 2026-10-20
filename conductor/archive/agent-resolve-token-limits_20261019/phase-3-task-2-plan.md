# Implementation Plan — Phase 3, Task 2: Implement 25% cached token accounting, pre-call budget checks, dual summary metrics, and boundary regex matching (TDD Green phase)

## 1. Overview & Objective
Implement the Green phase components for Phase 3 of `agent-resolve-token-limits_20261019` to satisfy all failing unit tests established in Phase 3 Task 1 (`commit: 91f7fdec`).

This Green phase transitions the agent pipeline from raw token accounting to a 25% discounted effective token model, introduces pre-call budget enforcement, isolates usage recording from transient retry logic, and prevents status code collision on formatted numeric strings.

Specific deliverables:
1. **`TokenTracker` Effective Token Accounting:**
   - Weight `cached_content_token_count` at 25% (`effective_call_tokens = max(0, total - cached) + int(0.25 * cached)`).
   - Clamp uncached tokens to zero if provider metadata reports cached tokens exceeding total tokens.
   - Maintain cumulative `effective_tokens: int = 0` initialized in the dataclass.
2. **`TokenTracker.check_budget()` Public Method:**
   - Raise `RuntimeError(f"Token budget exceeded: {self.effective_tokens:,} effective tokens used ({self.total_tokens:,} raw total, limit: {limit:,})")` strictly when `self.effective_tokens > limit`.
   - Allow exact boundary (`self.effective_tokens == limit`).
   - Delegate budget checks inside `record_usage()`.
3. **`TokenTracker.summary()` Dual Metric Formatting:**
   - Format: `"{self.effective_tokens:,} effective tokens / {self.total_tokens:,} raw total ({self.prompt_tokens:,} prompt [{self.cached_tokens:,} cached @ 25%], {self.candidate_tokens:,} candidates) across {self.call_count} API call(s)"`.
4. **Pre-Call Budget Check & Retry Isolation in `call_gemini_with_fallback`:**
   - Guard Gemini API generation with `token_tracker.check_budget()` prior to attempt 1 and before each backoff retry.
   - Isolate `token_tracker.record_usage()` outside the transient retry `try/except` block to guarantee budget exceptions or accounting failures never trigger false-positive retries.
5. **Status-Boundary Regex Matching in `is_transient_error`:**
   - Match status codes `429`, `500`, `502`, `503`, and `504` using regex pattern `r"(?<![0-9,])(?:429|500|502|503|504)(?![0-9,])"`.
   - Prevent false-positive matching on numbers like `"500,000"` or line numbers like `"5020"`.
6. **Legacy Unit Test Harmonization:**
   - Update legacy test assertions in `scripts/agent-resolve/tests/test_tracker.py` to match the dual metric summary and exception formats.

---

## 2. Target Files & Semantic Insertion Anchors

### 2.1 TokenTracker Module
- **Path:** `scripts/agent-resolve/agent_resolve/tracker.py`
- **Action:** Modify existing module.
- **Semantic Insertion Anchors:**
  1. In `TokenTracker` dataclass (lines 12–19):
     - Append field `effective_tokens: int = 0`.
  2. In `record_usage(self, usage_metadata: Any) -> None` (lines 20–39):
     - Compute `uncached_tokens = max(0, t_tokens - cached)`.
     - Compute `effective_call_tokens = uncached_tokens + int(0.25 * cached)`.
     - Accumulate `self.effective_tokens += effective_call_tokens`.
     - Replace inline threshold comparison with `self.check_budget()`.
  3. New method `check_budget(self) -> None`:
     - Insert immediately after `record_usage`.
     - Check `self.effective_tokens > limit`, raising `RuntimeError` with formatted dual metrics.
  4. In `summary(self) -> str` (lines 40–45):
     - Update return string to dual metric format including effective tokens and cached tokens with `@ 25%`.

### 2.2 LLM Engine Module
- **Path:** `scripts/agent-resolve/agent_resolve/llm.py`
- **Action:** Modify existing module.
- **Semantic Insertion Anchors:**
  1. Top-level constants (after imports, before `get_genai_client`):
     - Define `STATUS_CODE_BOUNDARY_REGEX = re.compile(r"(?<![0-9,])(?:429|500|502|503|504)(?![0-9,])")`.
  2. In `is_transient_error(err: Exception) -> bool` (lines 46–79):
     - Evaluate `STATUS_CODE_BOUNDARY_REGEX.search(str(err))` first.
     - Remove raw numeric status strings (`"429"`, `"500"`, `"502"`, `"503"`, `"504"`) from the uppercase substring search list `transient_indicators`.
  3. In `call_gemini_with_fallback(...)` (lines 81–156):
     - Insert pre-call budget guard `if token_tracker: token_tracker.check_budget()` at the beginning of each attempt iteration (before the `try:` block).
     - Narrow the transient retry `try/except` block to enclose only `client.models.generate_content(...)`.
     - Position `token_tracker.record_usage(response.usage_metadata)` outside the transient retry exception block so that budget exceeded errors propagate immediately without triggering backoff retries.
  4. In `__all__` list (lines 158–162):
     - Export `STATUS_CODE_BOUNDARY_REGEX`.

### 2.3 Legacy Tracker Unit Tests
- **Path:** `scripts/agent-resolve/tests/test_tracker.py`
- **Action:** Modify existing test cases.
- **Semantic Insertion Anchors:**
  1. In `test_record_usage_raises_runtime_error_when_budget_exceeded` (lines 63–76):
     - Update asserted exception substring from:
       `"Token budget exceeded: 500,001 tokens used (limit: 500,000)"`
       to:
       `"Token budget exceeded: 500,001 effective tokens used (500,001 raw total, limit: 500,000)"`.
  2. In `test_summary_formats_comma_separated_metrics` (lines 78–99):
     - Update expected summary string from:
       `"2,000 total tokens (1,700 prompt, 300 candidates, 400 cached) across 2 API call(s)"`
       to:
       `"1,700 effective tokens / 2,000 raw total (1,700 prompt [400 cached @ 25%], 300 candidates) across 2 API call(s)"`.

---

## 3. Interfaces, Types & Exported Signatures

### 3.1 `agent_resolve/tracker.py`
```python
@dataclass
class TokenTracker:
    prompt_tokens: int = 0
    candidate_tokens: int = 0
    total_tokens: int = 0
    cached_tokens: int = 0
    call_count: int = 0
    max_tokens: int | None = None
    effective_tokens: int = 0

    def record_usage(self, usage_metadata: Any) -> None:
        """
        Extracts token counts, handles None values, accumulates raw metrics,
        computes effective tokens with 25% cached discounting (clamped >= 0),
        increments call count, and executes check_budget().
        """
        ...

    def check_budget(self) -> None:
        """
        Verifies effective token budget against max_tokens or config.MAX_TOKENS_PER_ISSUE.
        Raises RuntimeError if self.effective_tokens > limit.
        Permits self.effective_tokens <= limit.
        """
        ...

    def summary(self) -> str:
        """
        Returns formatted dual metric summary:
        '{effective_tokens:,} effective tokens / {total_tokens:,} raw total ({prompt_tokens:,} prompt [{cached_tokens:,} cached @ 25%], {candidate_tokens:,} candidates) across {call_count} API call(s)'
        """
        ...

__all__: list[str] = ["TokenTracker"]
```

### 3.2 `agent_resolve/llm.py`
```python
STATUS_CODE_BOUNDARY_REGEX: re.Pattern[str] = re.compile(
    r"(?<![0-9,])(?:429|500|502|503|504)(?![0-9,])"
)

def is_transient_error(err: Exception) -> bool:
    """
    Evaluates whether an error represents a transient network, rate limit, or server issue.
    Uses STATUS_CODE_BOUNDARY_REGEX for HTTP status codes (429, 500, 502, 503, 504)
    and substring matching for uppercase textual indicators.
    """
    ...

def call_gemini_with_fallback(
    client: Any,
    contents: str,
    models: List[str],
    schema_cls: Optional[Type[T]] = None,
    temperature: float = 0.2,
    token_tracker: Optional[TokenTracker] = None,
    max_retries_per_model: int = 3,
) -> Any:
    """
    Executes Gemini API generation with pre-call budget checks, exponential backoff,
    and isolated usage tracking outside the transient retry handler.
    """
    ...

__all__: list[str] = [
    "STATUS_CODE_BOUNDARY_REGEX",
    "get_genai_client",
    "is_transient_error",
    "call_gemini_with_fallback",
]
```

---

## 4. Precise Behavioral Logic, Formulas & Conditions

### 4.1 Token Calculation Formula
Given `usage_metadata`:
1. Safely extract counts with default `0`:
   - `p_tokens = getattr(usage_metadata, "prompt_token_count", 0) or 0`
   - `c_tokens = getattr(usage_metadata, "candidates_token_count", 0) or 0`
   - `t_tokens = getattr(usage_metadata, "total_token_count", 0) or 0`
   - `cached = getattr(usage_metadata, "cached_content_token_count", 0) or 0`
2. Accumulate raw tallies:
   - `self.prompt_tokens += p_tokens`
   - `self.candidate_tokens += c_tokens`
   - `self.total_tokens += t_tokens`
   - `self.cached_tokens += cached`
   - `self.call_count += 1`
3. Compute effective call tokens:
   - `uncached_tokens = max(0, t_tokens - cached)` (prevents negative values if provider reports `cached > total`)
   - `effective_call_tokens = uncached_tokens + int(0.25 * cached)` (integer truncation)
   - `self.effective_tokens += effective_call_tokens`
4. Delegate budget assertion:
   - Call `self.check_budget()`

### 4.2 Budget Verification
1. Resolve limit:
   - `limit = self.max_tokens if self.max_tokens is not None else config.MAX_TOKENS_PER_ISSUE`
2. Evaluate condition:
   - If `self.effective_tokens > limit`:
     Raise `RuntimeError(f"Token budget exceeded: {self.effective_tokens:,} effective tokens used ({self.total_tokens:,} raw total, limit: {limit:,})")`
3. Exact boundary:
   - When `self.effective_tokens == limit`, do not raise.

### 4.3 Summary Formatting
Return formatted string:
`f"{self.effective_tokens:,} effective tokens / {self.total_tokens:,} raw total ({self.prompt_tokens:,} prompt [{self.cached_tokens:,} cached @ 25%], {self.candidate_tokens:,} candidates) across {self.call_count} API call(s)"`

### 4.4 Status Boundary Matching
1. String extraction:
   - `raw_str = str(err)`
2. Pattern evaluation:
   - If `STATUS_CODE_BOUNDARY_REGEX.search(raw_str)`: return `True`
3. Substring evaluation:
   - Look for uppercase keyword indicators (`RESOURCE_EXHAUSTED`, `RATE_LIMIT`, `QUOTA`, `UNAVAILABLE`, `OVERLOADED`, `DEADLINE_EXCEEDED`, transport disconnects) in `raw_str.upper()`.
   - If any match: return `True`.
4. Otherwise: return `False`.

### 4.5 LLM Invocation & Retry Isolation
1. For each `model_name` in `models`:
   - For `attempt` from 1 to `max_retries_per_model`:
     - **Pre-Call Check:** If `token_tracker` is present, call `token_tracker.check_budget()`.
     - **Generation Execution:** Inside transient `try/except`:
       - Invoke `response = client.models.generate_content(...)`.
     - **Transient Exception Handling:**
       - If an exception occurs:
         - Record `last_err = e`.
         - If `is_transient_error(e)` and `attempt < max_retries_per_model`:
           - Compute exponential backoff with jitter.
           - `time.sleep(delay)`.
           - Continue to next attempt.
         - Else: log error and break to next model.
     - **Usage Tracking (Isolated):**
       - If `token_tracker` and `hasattr(response, "usage_metadata")`:
         - Call `token_tracker.record_usage(response.usage_metadata)`.
     - **Response Parsing:**
       - Handle `schema_cls` or text response extraction.
       - Return parsed object or text.
2. If loop exhausts without success, raise `RuntimeError(f"API call to model {models[0]} failed. Last error: {last_err}")`.

---

## 5. Execution Verification Protocol

Perform empirical verification using the repository's test runner:

1. **Verify TokenTracker Unit Tests:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_tracker.py
   ```
   *Expected:* All 11 tests pass with zero errors.

2. **Verify LLM Engine Unit Tests:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_llm.py
   ```
   *Expected:* All 21 tests pass with zero errors.

3. **Verify Full Modular Agent Test Suite:**
   ```bash
   npm run test:agent
   ```
   *Expected:* All unit test suites in `scripts/agent-resolve/tests/` pass cleanly without regressions across stages, context, pipeline, vcs, models, tracker, and llm.

---

## 6. Post-Execution Commit & Git Notes Protocol

### 6.1 Git Commit (requires `BypassSandbox: true`)
```bash
git add scripts/agent-resolve/agent_resolve/tracker.py \
        scripts/agent-resolve/agent_resolve/llm.py \
        scripts/agent-resolve/tests/test_tracker.py

git commit -m "feat(agent-resolve): implement 25% cached token accounting, pre-call budget checks, dual summary metrics, and boundary regex matching"
```

### 6.2 Git Note Attachment (requires `BypassSandbox: true`)
```bash
git notes add -m "Task: Implement 25% cached token accounting, pre-call budget checks, dual summary metrics, and boundary regex matching (TDD Green phase)
Summary: Implemented 25% cached token discounting in TokenTracker, added check_budget() guard and dual metric summary formatting, integrated pre-call budget checks and retry isolation in call_gemini_with_fallback, applied status boundary regex to is_transient_error, and updated legacy tracker unit tests.
Files: scripts/agent-resolve/agent_resolve/tracker.py, scripts/agent-resolve/agent_resolve/llm.py, scripts/agent-resolve/tests/test_tracker.py
Rationale: Satisfies Phase 3 green phase by discounting cached token cost at 25%, preventing runaway API spend with pre-call budget enforcement, eliminating false-positive transient retries on formatted token numbers or line references, and providing transparent dual metrics for observability." $(git log -1 --format="%H")
```

### 6.3 Conductor Plan Update (`conductor/tracks/agent-resolve-token-limits_20261019/plan.md`)
Mark Phase 3 Task 2 as completed with the commit SHA and commit:
```bash
git add conductor/tracks/agent-resolve-token-limits_20261019/plan.md
git commit -m "conductor(plan): Mark task 'Implement 25% cached token accounting, pre-call budget checks, dual summary metrics, and boundary regex matching (TDD Green phase)' as complete"
```
