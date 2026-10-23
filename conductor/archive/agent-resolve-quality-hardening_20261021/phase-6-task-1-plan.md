# Implementation Plan — Phase 6, Task 1: Write failing unit tests for semantic diagnostic filtering and stack trace pruning (TDD Red phase)

## 1. Overview & Objective
Establish authoritative failing unit tests for Phase 6 of `agent-resolve-quality-hardening_20261021`. This Red phase verifies:
1. **Internal Stack Frame Filtering in `agent_resolve.diagnostics.truncate_error_context`:**
   - Strips internal framework stack frames matching `node_modules/` (including container `/app/node_modules/`).
   - Strips runtime internal stack frames matching `node:internal/` and `internal/` (e.g. `(internal/process/task_queues:95:5)` or `at internal/main/run_main_module.js:17:47`).
   - Strictly preserves user-space stack frames (e.g. `at Object.<anonymous> (/workspace/lib/utils.ts:42:15)` or `at UserProfile (/workspace/components/UserProfile.tsx:18:9)`).
2. **Diagnostic Fidelity & Preservation:**
   - Preserves TypeScript compiler diagnostic outputs (`error TS...`, file locations, and error messages).
   - Preserves ESLint diagnostics (rule names, error severities, column/line positions).
   - Preserves Jest multi-line assertion diffs (`- Expected`, `+ Received`, inspected object dumps, code frames, caret indicators), even if values inside diff structures contain string keywords like `"node_modules/"`.
   - Preserves error descriptions, headings, and test failure summaries.
3. **Consecutive Newline Collapsing:**
   - Normalizes and collapses 3+ consecutive newlines down to 2 (`\n\n`) to eliminate sparse whitespace from pruned stack traces and sparse command outputs.
4. **4,000-Character Ceiling & Split Marker:**
   - Lowers default truncation cap from 8,000 characters to 4,000 characters.
   - For outputs exceeding 4,000 characters, retains the first 2,000 characters (head) and last 2,000 characters (tail), separated by `\n\n... [TRUNCATED {count} CHARS OF VERIFICATION OUTPUT] ...\n\n`.
   - Preserves explicit `max_chars` parameter override behavior for callers specifying custom ceilings.
   - Preserves ANSI stripping prior to length evaluation.

As a strict TDD Red phase, all newly authored and updated tests must fail cleanly against the current unadapted codebase (`max_chars=8000`, no stack frame filtering, no newline collapsing) and pass cleanly upon completion of Phase 6 Task 2 (Green phase).

---

## 2. Target Files & Semantic Insertion Anchors

### 2.1 Diagnostics Unit Test Suite
- **Path:** `scripts/agent-resolve/tests/test_diagnostics.py`
- **Action:** Modify existing test suite.
- **Semantic Insertion Anchor:** Inside `TestTruncateErrorContext` class (lines 321–343).
  - Update existing `test_truncate_error_context_strips_ansi_before_measuring_length` (lines 326–330) and `test_truncate_error_context_splits_head_and_tail_with_marker` (lines 332–338) to reflect the 4,000-character default ceiling.
  - Insert new test methods directly following `test_truncate_error_context_handles_empty_string` (line 342) and immediately preceding `if __name__ == "__main__":` (line 344).

- **Target Additions & Updates:**
  1. `test_truncate_error_context_strips_ansi_before_measuring_length` (Update):
     - Sets `clean_part = "A" * 3900` (clean length <= 4,000).
     - Wraps in ANSI escape codes such that raw string length exceeds 4,000 characters.
     - Asserts `truncate_error_context(raw)` returns `clean_part` without truncation.
  2. `test_truncate_error_context_splits_head_and_tail_with_marker` (Update):
     - Sets `head = "H" * 2000`, `middle = "M" * 2000`, `tail = "T" * 2000` (total 6,000 clean chars).
     - Asserts output splits into 2,000 chars head and 2,000 chars tail with marker `\n\n... [TRUNCATED 2000 CHARS OF VERIFICATION OUTPUT] ...\n\n`.
  3. `test_truncate_error_context_strips_node_modules_and_internal_stack_frames`:
     - Provides raw verification error output containing:
       - Header / description: `Error: expect(received).toBe(expected)`
       - User-space frames:
         - `    at Object.<anonymous> (/workspace/lib/utils.ts:42:15)`
         - `    at processAction (/workspace/lib/services/winery.ts:108:7)`
       - Internal framework frames:
         - `    at Promise.then.completed (/app/node_modules/jest-circus/build/utils.js:391:28)`
         - `    at callAsyncCircusFn (node_modules/jest-circus/build/utils.js:316:10)`
         - `    at _callCircusTest (/app/node_modules/jest-circus/build/run.js:218:40)`
         - `    at async runTestInternal (/workspace/node_modules/jest-runner/build/runTest.js:389:16)`
       - Node.js runtime internal frames:
         - `    at processTicksAndRejections (node:internal/process/task_queues:95:5)`
         - `    at runNextTicks (node:internal/process/task_queues:65:3)`
         - `    at internal/main/run_main_module.js:17:47`
         - `    at Module._compile (internal/modules/cjs/loader.js:1063:30)`
     - Asserts that all user-space frames and error descriptions are present in result.
     - Asserts that none of the `node_modules/`, `/app/node_modules/`, `node:internal/`, or `internal/` stack frames appear in result.
  4. `test_truncate_error_context_preserves_typescript_eslint_and_jest_diffs`:
     - Provides raw verification output containing:
       - TypeScript compiler error lines:
         `lib/services/wineryService.ts:42:15 - error TS2322: Type 'string' is not assignable to type 'number'.`
         `lib/stores/useWineryStore.ts(18,5): error TS2304: Cannot find name 'WineryFilter'.`
       - ESLint diagnostic output:
         `/workspace/lib/utils/format.ts:14:3: Unexpected ternary operator in conditional expression [Error/no-nested-ternary]`
       - Multi-line Jest assertion diff:
         ```
           ● WineryStore › updates search query state

             expect(received).toEqual(expected)

             - Expected  - 1
             + Received  + 1

               Object {
             -   "query": "Finger Lakes",
             +   "query": "Seneca Lake",
                 "filters": Array [
             +     "node_modules/package",
                 ],
               }

               24 |     store.setQuery("Seneca Lake");
             > 25 |     expect(store.query).toEqual("Finger Lakes");
                  |                         ^
               26 |   });
         ```
     - Asserts that TypeScript compiler errors, ESLint diagnostics, code frames, and diff lines (including `+     "node_modules/package",` which is data, not a stack frame) are preserved intact.
  5. `test_truncate_error_context_collapses_consecutive_blank_lines`:
     - Provides text with 3, 4, and 5 consecutive newlines (`\n\n\n`, `\n\n\n\n`, `\n\n\n\n\n`).
     - Asserts that all occurrences are collapsed down to exactly 2 newlines (`\n\n`).
  6. `test_truncate_error_context_enforces_4000_char_ceiling_default_with_split_marker`:
     - Verifies that a clean string of 6,000 characters without stack frames is truncated to 4,000 characters total (2,000 head, 2,000 tail) with `... [TRUNCATED 2000 CHARS OF VERIFICATION OUTPUT] ...`.
     - Confirms that text <= 4,000 chars is returned untruncated.
  7. `test_truncate_error_context_allows_custom_max_chars_override`:
     - Invokes `truncate_error_context(text, max_chars=8000)` with 10,000 characters.
     - Asserts that explicit `max_chars` parameter is honored, splitting at 4,000 head / 4,000 tail with `... [TRUNCATED 2000 CHARS OF VERIFICATION OUTPUT] ...`.

---

## 3. Interfaces, Types & Exported Signatures

### 3.1 Diagnostics Function Signature (`scripts/agent-resolve/agent_resolve/diagnostics.py`)
```python
def truncate_error_context(text: str, max_chars: int = 4000) -> str:
    """
    Sanitizes and bounds verification error output for LLM prompts:
    1. Strips ANSI escape sequences.
    2. Prunes internal framework stack frames (matching node_modules/, node:internal/, internal/)
       while strictly preserving user-space frames, code snippets, TypeScript compiler errors,
       ESLint diagnostics, and multi-line assertion diffs.
    3. Collapses 3+ consecutive newlines down to 2 (\\n\\n).
    4. Enforces a maximum character cap (default 4,000 chars: 2,000 head / 2,000 tail)
       joined by '\\n\\n... [TRUNCATED {truncated_count} CHARS OF VERIFICATION OUTPUT] ...\\n\\n'.

    Parameters:
        text: Raw compiler or test runner standard output/error.
        max_chars: Character ceiling for truncated context. Defaults to 4000.

    Returns:
        str: Sanitized, pruned, and bounded error context.
    """
```

### 3.2 Regex Patterns for Pruning (`scripts/agent-resolve/agent_resolve/diagnostics.py`)
```python
# Stack frame detection: lines beginning with optional whitespace followed by 'at '
STACK_FRAME_PATTERN: Final[Pattern[str]] = re.compile(r"^\s*at\s+")

# Internal framework path indicators within stack frames:
# - node_modules/ (including /app/node_modules/)
# - node:internal/
# - internal/ (following parenthesis, slash, or directly after 'at ')
INTERNAL_FRAME_INDICATOR_PATTERN: Final[Pattern[str]] = re.compile(
    r"(?:node_modules/|node:internal/|(?:\(|^|\s|[/\\])internal/)"
)

# Consecutive newline collapsing pattern (3 or more newlines)
CONSECUTIVE_NEWLINES_PATTERN: Final[Pattern[str]] = re.compile(r"\n{3,}")
```

### 3.3 Module Exports (`scripts/agent-resolve/agent_resolve/diagnostics.py` & `__init__.py`)
```python
__all__: list[str] = [
    "grep_search",
    "find_files",
    "read_file_snippet",
    "parse_issue_diagnostics",
    "strip_ansi",
    "truncate_error_context",
]
```

---

## 4. Precise Behavioral Logic

### 4.1 Transformation Pipeline
1. **ANSI Escape Stripping:**
   - Execute `clean = strip_ansi(text)`.
   - If `clean` is empty or whitespace, return `clean`.
2. **Negative Stack Frame Pruning:**
   - Split `clean` into lines: `lines = clean.splitlines()`.
   - Filter lines according to the rule:
     - A line is identified as a stack frame if `STACK_FRAME_PATTERN.match(line)` is truthy.
     - An identified stack frame line is pruned (omitted) if `INTERNAL_FRAME_INDICATOR_PATTERN.search(line)` matches `node_modules/`, `node:internal/`, or `internal/`.
     - An identified stack frame line that does NOT match internal indicators (e.g. `at Object.<anonymous> (/workspace/lib/utils.ts:42:15)`) is retained.
     - Any line that is NOT a stack frame (TS errors `error TS...`, ESLint outputs, Jest failure summaries `● Test Suite`, assertion diffs `- Expected`, `+ Received`, code frames `> 25 | ...`) is retained, even if a line contains the substring `"node_modules"`.
   - Join surviving lines with `"\n"`.
3. **Sparse Whitespace Normalization:**
   - Collapse 3+ consecutive newlines to 2: `re.sub(CONSECUTIVE_NEWLINES_PATTERN, "\n\n", filtered_text)`.
4. **Length Ceiling & Head/Tail Truncation:**
   - Calculate `total = len(normalized_text)`.
   - If `total <= max_chars`: return `normalized_text`.
   - If `total > max_chars`:
     - `half = max_chars // 2` (2,000 characters under default `max_chars = 4000`).
     - `head = normalized_text[:half]`
     - `tail = normalized_text[-half:]`
     - `truncated_count = total - (half * 2)`
     - `marker = f"\n\n... [TRUNCATED {truncated_count} CHARS OF VERIFICATION OUTPUT] ...\n\n"`
     - Return `f"{head}{marker}{tail}"`.

### 4.2 Edge Cases & Invariants
- **Empty or Whitespace Input:** Returns empty string immediately without markers.
- **Pure Internal Stack Trace:** When all stack frames are internal, all `at node_modules/...` lines are pruned, leaving only error descriptions and user-space context.
- **Data vs Code:** Non-stack lines containing `"node_modules"` (e.g. diffs or JSON payloads) are never pruned because `STACK_FRAME_PATTERN` does not match.
- **Custom `max_chars` Overrides:** Passing `max_chars=8000` or any integer bounds the output to the specified cap while still applying stack frame pruning and blank line collapsing.

---

## 5. Execution Verification Protocol

Execute tests to verify that all newly authored unit tests fail cleanly against the current unadapted codebase (TDD Red phase):

1. **Verify `test_diagnostics.py` Red Phase:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_diagnostics.py -k "TestTruncateErrorContext"
   ```
   *Expected Failure:*
   - `AssertionError` in `test_truncate_error_context_strips_node_modules_and_internal_stack_frames` (internal frames present in unadapted output).
   - `AssertionError` in `test_truncate_error_context_collapses_consecutive_blank_lines` (3+ newlines not collapsed).
   - `AssertionError` in `test_truncate_error_context_enforces_4000_char_ceiling_default_with_split_marker` and `test_truncate_error_context_splits_head_and_tail_with_marker` (expected 4,000 character cap, got 8,000 cap).

2. **Verify Full Modular Agent Test Suite Status:**
   ```bash
   npm run test:agent
   ```
   *Expected Status:* Pre-existing test suites across `scripts/agent-resolve/tests/` pass cleanly; `test_diagnostics.py` fails on the new Phase 6 Red phase assertions.

---

## 6. Post-Execution Commit & Git Notes Protocol

1. **Commit Red Phase Test Changes (requires `BypassSandbox: true`):**
   ```bash
   git add scripts/agent-resolve/tests/test_diagnostics.py
   git commit -m "test(agent-resolve): add failing unit tests for semantic diagnostic filtering and stack trace pruning"
   ```

2. **Attach Git Note (requires `BypassSandbox: true`):**
   ```bash
   git notes add -m "Task: Write failing unit tests for semantic diagnostic filtering and stack trace pruning (TDD Red phase)
   Summary: Authored comprehensive failing unit tests in test_diagnostics.py asserting truncate_error_context prunes internal node_modules/ and runtime internal/ stack frames while strictly preserving user-space frames, TypeScript compiler diagnostics, ESLint outputs, and multi-line Jest assertion diffs, collapses consecutive newlines to two, and enforces a 4,000 character ceiling default with head/tail split marker.
   Files: scripts/agent-resolve/tests/test_diagnostics.py
   Rationale: Establishes authoritative automated TDD Red phase tests ensuring verification error context injected into Gemini prompts is aggressively pruned of useless framework noise and token waste before implementing the filtering logic in Phase 6 Task 2." $(git log -1 --format="%H")
   ```

3. **Update Track Plan & Commit (`conductor/tracks/agent-resolve-quality-hardening_20261021/plan.md`):**
   Record the 7-character commit SHA on Phase 6 Task 1 in `plan.md` and commit with `conductor(plan): Mark task 'Write failing unit tests for semantic diagnostic filtering and stack trace pruning (TDD Red phase)' as complete`.
