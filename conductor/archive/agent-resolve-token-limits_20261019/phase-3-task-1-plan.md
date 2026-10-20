# Implementation Plan — Phase 3, Task 1: Write failing unit tests for 25% cached token accounting, pre-call budget checks, dual summary metrics, and boundary regex matching (TDD Red phase)

## 1. Overview & Objective
Establish authoritative failing unit tests for Phase 3 of `agent-resolve-token-limits_20261019`. This Red phase verifies:
1. `TokenTracker` effective token accounting weighting `cached_content_token_count` at 25% (`effective_call_tokens = max(0, total - cached) + int(0.25 * cached)`), handling `None` attributes, clamping negative uncached tokens when cached exceeds total, accumulating across multiple calls, and initializing `effective_tokens: int = 0`.
2. `TokenTracker.check_budget()` public method raising `RuntimeError(f"Token budget exceeded: {self.effective_tokens:,} effective tokens used ({self.total_tokens:,} raw total, limit: {limit:,})")` when `self.effective_tokens > limit`, while permitting exact budget boundaries (`effective_tokens == limit`), and verify that `record_usage()` calls `check_budget()`.
3. `TokenTracker.summary()` formatting dual metrics: `"{self.effective_tokens:,} effective tokens / {self.total_tokens:,} raw total ({self.prompt_tokens:,} prompt [{self.cached_tokens:,} cached @ 25%], {self.candidate_tokens:,} candidates) across {self.call_count} API call(s)"`.
4. `call_gemini_with_fallback` pre-call budget guard invoking `token_tracker.check_budget()` before initiating every Gemini API call and before each backoff retry attempt, preventing unnecessary API generation when the budget is already exhausted.
5. Transient retry isolation in `call_gemini_with_fallback`, ensuring `token_tracker.record_usage()` cannot be caught by transient error handling or trigger false-positive retries.
6. Status-boundary regex matching in `is_transient_error` using `r"(?<![0-9,])(?:429|500|502|503|504)(?![0-9,])"`, verifying that formatted numeric strings like `"Token budget exceeded: 500,000 tokens used"`, line numbers like `"5020"`, or record counts like `"4290"` return `False`, while authentic HTTP status errors (e.g. `"HTTP 500"`, `"(429)"`, `"[503]"`) return `True`.

As a strict TDD Red phase, all authored tests must fail against the current unadapted codebase and pass cleanly upon completion of Phase 3 Task 2 (Green phase).

---

## 2. Target Files & Semantic Insertion Anchors

### 2.1 TokenTracker Unit Tests
- **Path:** `scripts/agent-resolve/tests/test_tracker.py`
- **Action:** Modify existing test suite.
- **Semantic Insertion Anchor:** Inside `TestTokenTracker` class, immediately after `test_summary_formats_comma_separated_metrics` (line 100).
- **Target Additions:**
  - `test_initial_state_effective_tokens_zeroed`:
    - Asserts `TokenTracker().effective_tokens == 0`.
  - `test_record_usage_calculates_effective_tokens_with_25_percent_cached`:
    - Asserts call 1 (total=1500, prompt=1200, candidate=300, cached=400):
      `uncached = 1100`, `effective = 1100 + int(0.25 * 400) = 1200`.
      `tracker.effective_tokens == 1200`, `tracker.total_tokens == 1500`.
    - Asserts call 2 (total=500, prompt=500, candidate=None, cached=None):
      `uncached = 500`, `effective = 500`.
      Cumulative `tracker.effective_tokens == 1700`, `tracker.total_tokens == 2000`.
  - `test_record_usage_clamps_negative_uncached_tokens_if_cached_exceeds_total`:
    - Simulates anomalous provider metadata: `total_token_count = 100`, `cached_content_token_count = 150`.
    - Asserts `uncached = max(0, 100 - 150) = 0`, `effective = 0 + int(0.25 * 150) = 37`.
    - Asserts `tracker.effective_tokens == 37`.
  - `test_check_budget_allows_at_or_below_limit`:
    - Instantiates `TokenTracker(max_tokens=1000)`.
    - Sets `tracker.effective_tokens = 1000`, `tracker.total_tokens = 2000`.
    - Asserts `tracker.check_budget()` returns `None` without raising.
  - `test_check_budget_raises_runtime_error_when_effective_tokens_exceed_limit`:
    - Instantiates `TokenTracker(max_tokens=1000)`.
    - Sets `tracker.effective_tokens = 1001`, `tracker.total_tokens = 2500`.
    - Asserts `with self.assertRaises(RuntimeError) as ctx: tracker.check_budget()`.
    - Asserts exception message matches `"Token budget exceeded: 1,001 effective tokens used (2,500 raw total, limit: 1,000)"`.
  - `test_record_usage_invokes_check_budget_and_raises_with_dual_metrics`:
    - Instantiates `TokenTracker(max_tokens=500_000)`.
    - Records usage with total=600,000, prompt=500,000, candidates=100,000, cached=100,000.
      `uncached = 500,000`, `effective = 500,000 + 25,000 = 525,000`.
    - Asserts `with self.assertRaises(RuntimeError) as ctx: tracker.record_usage(...)`.
    - Asserts exception message matches `"Token budget exceeded: 525,000 effective tokens used (600,000 raw total, limit: 500,000)"`.
  - `test_summary_formats_dual_metrics_with_discounted_cache`:
    - Records 2 calls:
      Call 1: prompt=1200, candidate=300, total=1500, cached=400 (effective = 1200)
      Call 2: prompt=500, candidate=None, total=500, cached=None (effective = 500)
    - Asserts `tracker.summary()` equals:
      `"1,700 effective tokens / 2,000 raw total (1,700 prompt [400 cached @ 25%], 300 candidates) across 2 API call(s)"`.

### 2.2 LLM Pre-Call Budget Checks & Boundary Matching Unit Tests
- **Path:** `scripts/agent-resolve/tests/test_llm.py`
- **Action:** Modify existing test suite.
- **Semantic Insertion Anchors:**
  1. Inside `TestIsTransientError` class, immediately after `test_rejects_non_transient_errors` (line 155).
  2. Inside `TestCallGeminiWithFallback` class, immediately after `test_raises_when_token_tracker_budget_exceeded` (line 254).
- **Target Additions:**
  - In `TestIsTransientError`:
    - `test_status_boundary_regex_rejects_embedded_numbers_and_token_counts`:
      - Asserts `is_transient_error(...)` returns `False` for:
        - `RuntimeError("Token budget exceeded: 500,000 tokens used (limit: 500,000)")`
        - `Exception("Syntax error at line 5020: unexpected token")`
        - `Exception("Processed 4290 items successfully")`
        - `Exception("Task failed on worker 5031 with code 1")`
        - `Exception("Memory address offset 0x504000")`
        - `Exception("Token limit reached: 500,001 effective tokens")`
    - `test_status_boundary_regex_matches_exact_http_status_codes_and_delimiters`:
      - Asserts `is_transient_error(...)` returns `True` for authentic status codes separated by whitespace or punctuation:
        - `Exception("HTTP 429 Too Many Requests")`
        - `Exception("Error: 500 Internal Server Error")`
        - `Exception("502 Bad Gateway")`
        - `Exception("status code: 503")`
        - `Exception("Gateway Timeout: 504")`
        - `Exception("API error (500)")`
        - `Exception("Service unavailable [503]")`
        - `Exception("Server returned 502.")`
  - In `TestCallGeminiWithFallback`:
    - `test_pre_call_budget_check_raises_runtime_error_before_calling_gemini`:
      - Creates a `TokenTracker` mock whose `check_budget` raises `RuntimeError("Token budget exceeded: 500,001 effective tokens used (limit: 500,000)")`.
      - Calls `call_gemini_with_fallback(self.client, contents="Prompt", models=["gemini-3.8-flash"], token_tracker=tracker)`.
      - Asserts `with self.assertRaises(RuntimeError)` capturing `"Token budget exceeded"`.
      - Asserts `self.client.models.generate_content.assert_not_called()`.
    - `test_pre_call_budget_check_raises_before_retry_attempt`:
      - First `generate_content` call raises a transient error (`Exception("503 Service Unavailable")`).
      - Sets `tracker.check_budget` side effect to `[None, RuntimeError("Token budget exceeded: 500,001 effective tokens used (limit: 500,000)")]`.
      - Calls `call_gemini_with_fallback(..., token_tracker=tracker, max_retries_per_model=3)`.
      - Asserts `with self.assertRaises(RuntimeError)` capturing `"Token budget exceeded"`.
      - Asserts `self.client.models.generate_content.call_count == 1` (attempt 2 is blocked by the pre-call budget check).
    - `test_record_usage_isolated_from_transient_retry_handler`:
      - Mock `response.usage_metadata = MagicMock()`.
      - Mock `tracker.record_usage.side_effect = RuntimeError("Token budget exceeded: 500,001 effective tokens used (limit: 500,000)")`.
      - Calls `call_gemini_with_fallback(..., token_tracker=tracker, max_retries_per_model=3)`.
      - Asserts `with self.assertRaises(RuntimeError)`.
      - Asserts `self.client.models.generate_content.call_count == 1` (no retry loop triggered).

---

## 3. Interfaces, Types & Exported Signatures

### 3.1 TokenTracker Interface (`agent_resolve/tracker.py`)
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
        Accumulates token counts and computes effective tokens:
        uncached = max(0, total - cached)
        effective_call = uncached + int(0.25 * cached)
        self.effective_tokens += effective_call
        Calls self.check_budget().
        """
        ...

    def check_budget(self) -> None:
        """
        Raises RuntimeError if effective_tokens > limit (max_tokens or config.MAX_TOKENS_PER_ISSUE).
        Format: Token budget exceeded: {effective_tokens:,} effective tokens used ({total_tokens:,} raw total, limit: {limit:,})
        """
        ...

    def summary(self) -> str:
        """
        Returns formatted dual metrics:
        {effective_tokens:,} effective tokens / {total_tokens:,} raw total ({prompt_tokens:,} prompt [{cached_tokens:,} cached @ 25%], {candidate_tokens:,} candidates) across {call_count} API call(s)
        """
        ...
```

### 3.2 LLM Engine Signatures & Boundary Regex (`agent_resolve/llm.py`)
```python
STATUS_CODE_BOUNDARY_REGEX: re.Pattern[str] = re.compile(
    r"(?<![0-9,])(?:429|500|502|503|504)(?![0-9,])"
)

def is_transient_error(err: Exception) -> bool:
    """
    Identifies transient rate limits, server errors, and socket/transport disconnects.
    Uses STATUS_CODE_BOUNDARY_REGEX for status codes 429, 500, 502, 503, 504 to prevent
    embedded numbers (e.g. 500,000 or 5020) from matching.
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
```

---

## 4. Behavioral Logic, Conditions & Edge Cases

1. **25% Discounted Cached Token Formula:**
   - Provider usage metadata fields:
     - `p_tokens = getattr(usage_metadata, "prompt_token_count", 0) or 0`
     - `c_tokens = getattr(usage_metadata, "candidates_token_count", 0) or 0`
     - `t_tokens = getattr(usage_metadata, "total_token_count", 0) or 0`
     - `cached = getattr(usage_metadata, "cached_content_token_count", 0) or 0`
   - Calculation:
     - `uncached_tokens = max(0, t_tokens - cached)` (prevents negative values if provider reports cached > total).
     - `effective_call_tokens = uncached_tokens + int(0.25 * cached)` (integer truncation for token counting).
     - `self.effective_tokens += effective_call_tokens`.

2. **Budget Verification & Limit Invariant:**
   - `limit = self.max_tokens if self.max_tokens is not None else config.MAX_TOKENS_PER_ISSUE`.
   - Condition: `if self.effective_tokens > limit: raise RuntimeError(...)`.
   - Error string:
     `f"Token budget exceeded: {self.effective_tokens:,} effective tokens used ({self.total_tokens:,} raw total, limit: {limit:,})"`
   - Exact boundary: `self.effective_tokens == limit` is permitted; strictly greater triggers failure.
   - `record_usage()` delegates budget verification directly to `self.check_budget()`.

3. **Dual Metric Summary Invariant:**
   - Output template:
     `f"{self.effective_tokens:,} effective tokens / {self.total_tokens:,} raw total ({self.prompt_tokens:,} prompt [{self.cached_tokens:,} cached @ 25%], {self.candidate_tokens:,} candidates) across {self.call_count} API call(s)"`

4. **Pre-Call Guard & Retry Isolation Invariant:**
   - Guard check: `if token_tracker: token_tracker.check_budget()` is executed:
     1. Prior to entering the model attempt loop or at the start of each attempt before `client.models.generate_content(...)`.
     2. Immediately prior to executing backoff sleep/retry.
   - Isolation: The transient retry `try/except` block wraps only `client.models.generate_content(...)` and response text parsing. `token_tracker.record_usage()` runs outside the transient `try/except`, eliminating any risk of `RuntimeError("Token budget exceeded...")` being caught or triggering retries.

5. **Status Code Boundary Regex Invariant:**
   - Pattern: `r"(?<![0-9,])(?:429|500|502|503|504)(?![0-9,])"`.
   - Lookbehind `(?<![0-9,])`: rejects matches preceded immediately by digits or commas.
   - Lookahead `(?![0-9,])`: rejects matches followed immediately by digits or commas.
   - Non-numeric transient keywords (`RESOURCE_EXHAUSTED`, `RATE_LIMIT`, `QUOTA`, `UNAVAILABLE`, `OVERLOADED`, `DEADLINE_EXCEEDED`, socket disconnects) continue using substring matching on `str(err).upper()`.

---

## 5. Execution Verification Protocol

Execute unit tests to confirm that newly authored Phase 3 tests fail cleanly against the current unadapted codebase (TDD Red phase):

1. **Verify `test_tracker.py` Red Phase:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_tracker.py
   ```
   *Expected Failure:*
   - `AttributeError: 'TokenTracker' object has no attribute 'effective_tokens'`
   - `AttributeError: 'TokenTracker' object has no attribute 'check_budget'`
   - `AssertionError` on dual summary format and dual metric budget error message.

2. **Verify `test_llm.py` Red Phase:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_llm.py
   ```
   *Expected Failure:*
   - `AssertionError: True is not false` in `test_status_boundary_regex_rejects_embedded_numbers_and_token_counts` (substring check currently matches `"500"` in `"500,000"`).
   - `AssertionError: Expected 'generate_content' not to have been called` or `AttributeError` on `check_budget`.

3. **Verify Full Modular Agent Test Suite Status:**
   ```bash
   npm run test:agent
   ```
   *Expected Status:* Pre-existing Phase 1 and Phase 2 tests pass; newly added Phase 3 tests fail cleanly with expected assertion/attribute errors.

---

## 6. Post-Execution Commit & Git Notes Protocol

1. **Commit Red Phase Test Changes (requires `BypassSandbox: true`):**
   ```bash
   git add scripts/agent-resolve/tests/test_tracker.py scripts/agent-resolve/tests/test_llm.py
   git commit -m "test(agent-resolve): add failing unit tests for 25% cached token accounting, pre-call budget checks, dual summary metrics, and boundary regex matching"
   ```

2. **Attach Git Note (requires `BypassSandbox: true`):**
   ```bash
   git notes add -m "Task: Write failing unit tests for 25% cached token accounting, pre-call budget checks, dual summary metrics, and boundary regex matching (TDD Red phase)
   Summary: Authored failing unit test cases across test_tracker.py and test_llm.py asserting 25% cached token accounting, pre-call budget checks before API calls and retries, dual metric summary formatting, and status-boundary regex matching to prevent false-positive retries on 500,000 tokens or line 5020.
   Files: scripts/agent-resolve/tests/test_tracker.py, scripts/agent-resolve/tests/test_llm.py
   Rationale: Establishes strict TDD Red phase regression guards ensuring TokenTracker and LLM invocation correctly discount cached tokens, block calls before exceeding limits, and prevent transient retry loops on token limit errors before green phase implementation." $(git log -1 --format="%H")
   ```

3. **Update Track Plan & Commit (`conductor/tracks/agent-resolve-token-limits_20261019/plan.md`):**
   Record the commit SHA on Phase 3 Task 1 in `plan.md` and commit with:
   `conductor(plan): Mark task 'Write failing unit tests for 25% cached token accounting, pre-call budget checks, dual summary metrics, and boundary regex matching (TDD Red phase)' as complete`.
