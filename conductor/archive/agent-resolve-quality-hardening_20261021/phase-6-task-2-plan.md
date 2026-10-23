# Implementation Plan — Phase 6, Task 2: Implement semantic diagnostic filtering and update ADR-0005 to pass tests (TDD Green phase)

## 1. Overview & Objective
Implement the Green phase for Phase 6 of `agent-resolve-quality-hardening_20261021` to resolve the authoritative failing unit tests established in Task 1 (`55f267f3`):
1. **Semantic Diagnostic Filtering & Negative Stack Frame Pruning in `truncate_error_context`:**
   - Filter out internal framework stack frames matching `node_modules/` (including container `/app/node_modules/`).
   - Filter out runtime internal stack frames matching `node:internal/` and `internal/` (e.g. `(internal/process/task_queues:95:5)` or `at internal/main/run_main_module.js:17:47`).
   - Strictly retain user-space stack frames (e.g. `at Object.<anonymous> (/workspace/lib/utils.ts:42:15)` or `at processAction (/workspace/lib/services/winery.ts:108:7)`).
2. **Diagnostic & Diff Preservation:**
   - Preserve non-stack lines regardless of contents, ensuring TypeScript compiler error messages (`error TS...`), ESLint diagnostic lines (`[Error/no-nested-ternary]`), Jest test failure titles (`● WineryStore › ...`), multi-line assertion diffs (`- Expected`, `+ Received`, caret markers, code frames), and error summaries are never truncated or pruned, even if they contain strings like `"node_modules/"`.
3. **Sparse Whitespace Normalization:**
   - Normalize and collapse 3 or more consecutive newlines (`\n{3,}`) down to exactly 2 (`\n\n`) to eliminate whitespace holes created by pruned stack frames.
4. **4,000-Character Ceiling & Split Marker:**
   - Lower the default truncation limit from 8,000 characters to 4,000 characters (`max_chars = 4000`).
   - For outputs exceeding `max_chars`, preserve the first 2,000 characters (head) and last 2,000 characters (tail), separated by `\n\n... [TRUNCATED {count} CHARS OF VERIFICATION OUTPUT] ...\n\n`.
   - Preserve explicit `max_chars` caller overrides (e.g. `max_chars=8000`).
5. **Architectural Decision Record (ADR-0005) Documentation:**
   - Update Section 7 of `docs/adr/0005-autonomous-nightly-agent-workflow.md` to formally document the 4,000-character cap, stack frame pruning, and diagnostic sanitization invariants.

---

## 2. Target Files & Semantic Insertion Anchors

### 2.1 Diagnostics Module
- **Path:** `scripts/agent-resolve/agent_resolve/diagnostics.py`
- **Action:** Modify existing module.
- **Semantic Insertion Anchors:**
  1. **Pattern Definitions:** Directly above `strip_ansi` (lines 146–147), define the compiled regex constants for stack frame detection (`STACK_FRAME_PATTERN`), internal framework indicator filtering (`INTERNAL_FRAME_INDICATOR_PATTERN`), and consecutive newline collapsing (`CONSECUTIVE_NEWLINES_PATTERN`).
  2. **`truncate_error_context` Implementation:** Replace the existing function body and docstring (lines 156–173) with the semantic filtering, newline collapsing, and 4,000-character head/tail truncation logic.

### 2.2 Architectural Decision Record
- **Path:** `docs/adr/0005-autonomous-nightly-agent-workflow.md`
- **Action:** Modify documentation.
- **Semantic Insertion Anchor:** Section 7, sub-bullet 5 ("Stage 3 (Green Phase Implementation, Fail-Fast Compilation & Error Truncation)") at line 40. Replace the sentence describing 8,000-character truncation with documentation of negative stack frame pruning (`node_modules/`, `node:internal/`, `internal/`), consecutive newline collapsing, and the 4,000-character head/tail limit.

---

## 3. Interfaces, Types & Exported Signatures

### 3.1 Compiled Regex Constants (`scripts/agent-resolve/agent_resolve/diagnostics.py`)
```python
# Stack frame detection: lines beginning with optional leading whitespace followed by 'at '
STACK_FRAME_PATTERN: Final[Pattern[str]] = re.compile(r"^\s*at\s+")

# Internal framework path indicators within stack frames:
# - node_modules/ (including /app/node_modules/ and Windows \ paths)
# - node:internal/
# - internal/ (following parenthesis, slash, backslash, or directly after 'at ')
INTERNAL_FRAME_INDICATOR_PATTERN: Final[Pattern[str]] = re.compile(
    r"(?:node_modules[/\\]|node:internal[/\\]|(?:\(|^|\s|[/\\])internal[/\\])"
)

# Consecutive newline collapsing pattern: matches 3 or more newlines
CONSECUTIVE_NEWLINES_PATTERN: Final[Pattern[str]] = re.compile(r"\n{3,}")
```

### 3.2 Function Signature & Docstring (`scripts/agent-resolve/agent_resolve/diagnostics.py`)
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

### 3.3 Module Exports (`scripts/agent-resolve/agent_resolve/diagnostics.py`)
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
   - If `not clean`: return `""` immediately.
2. **Negative Stack Frame Pruning:**
   - Split `clean` into lines: `lines = clean.splitlines()`.
   - Iterate through lines with a filtering predicate:
     - Check whether line represents a stack frame: `is_stack_frame = bool(STACK_FRAME_PATTERN.match(line))`.
     - Check whether line contains internal indicators: `is_internal = bool(INTERNAL_FRAME_INDICATOR_PATTERN.search(line))`.
     - If `is_stack_frame and is_internal`: omit line from retained output.
     - Else: retain line.
   - Join surviving lines with `"\n"`: `filtered_text = "\n".join(surviving_lines)`.
3. **Whitespace Normalization:**
   - Collapse 3 or more consecutive newlines: `normalized = CONSECUTIVE_NEWLINES_PATTERN.sub("\n\n", filtered_text)`.
4. **Length Ceiling & Head/Tail Splitting:**
   - Compute `total = len(normalized)`.
   - If `total <= max_chars`: return `normalized`.
   - If `total > max_chars`:
     - `half = max_chars // 2` (2,000 characters for `max_chars = 4000`).
     - `head = normalized[:half]`
     - `tail = normalized[-half:]`
     - `truncated_count = total - (half * 2)`
     - `marker = f"\n\n... [TRUNCATED {truncated_count} CHARS OF VERIFICATION OUTPUT] ...\n\n"`
     - Return `f"{head}{marker}{tail}"`.

### 4.2 ADR-0005 Documentation Update
In Section 7 of `docs/adr/0005-autonomous-nightly-agent-workflow.md`, update line 40:
- From:
  `Strips ANSI escape sequences and enforces a strict head/tail 8,000 character truncation cap (retaining the first 4,000 and last 4,000 characters with ... [TRUNCATED {chars} CHARS OF VERIFICATION OUTPUT] ...) on last_error_context to prevent context explosion.`
- To:
  `Sanitizes and bounds verification failure context via truncate_error_context: strips ANSI escape sequences, negatively prunes internal framework and runtime stack frames (matching node_modules/, node:internal/, internal/) while strictly preserving user-space frames, TypeScript compiler diagnostics, ESLint outputs, and multi-line assertion diffs, collapses 3+ consecutive newlines down to 2 (\n\n), and enforces a strict head/tail 4,000 character truncation cap (retaining the first 2,000 and last 2,000 characters with ... [TRUNCATED {chars} CHARS OF VERIFICATION OUTPUT] ...) on last_error_context to prevent prompt context explosion.`

### 4.3 Invariants & Edge Cases
- **Data vs Code:** Assertion diff lines containing `"node_modules/"` in values (e.g. `+     "node_modules/package",`) do not match `STACK_FRAME_PATTERN` because the line starts with `+` rather than `at `, ensuring diffs are preserved intact.
- **Empty / Whitespace Output:** Returns `""` cleanly without markers or index errors.
- **Exact Length Boundary:** Text of exactly `max_chars` (4,000 chars) is returned untruncated.
- **Custom Max Chars:** When callers supply custom `max_chars` (e.g. `max_chars=8000`), the function scales `half = max_chars // 2` while still performing ANSI stripping, frame pruning, and newline collapsing.
- **Cross-Platform Path Separators:** `[/\\]` handles both POSIX slashes and Windows backslashes in stack traces.

---

## 5. Execution Verification Protocol

Following implementation, execute the verification commands:

1. **Verify `test_diagnostics.py` Suite (Green Phase):**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_diagnostics.py -k "TestTruncateErrorContext"
   ```
   *Expected Output:* All 8 tests in `TestTruncateErrorContext` pass cleanly (`OK`).

2. **Verify Full Modular Agent Test Suite:**
   ```bash
   npm run test:agent
   ```
   *Expected Output:* All tests across `scripts/agent-resolve/tests/` pass with 0 failures.

3. **Verify Dual-Suite Regression Compatibility:**
   ```bash
   npm run test:agent:all
   ```
   *Expected Output:* 100% test passage across modular unit tests and legacy compatibility tests.

---

## 6. Post-Execution Commit & Git Notes Protocol

1. **Commit Implementation & Documentation Changes (requires `BypassSandbox: true`):**
   ```bash
   git add scripts/agent-resolve/agent_resolve/diagnostics.py docs/adr/0005-autonomous-nightly-agent-workflow.md
   git commit -m "feat(agent-resolve): implement semantic diagnostic filtering and update ADR-0005"
   ```

2. **Attach Git Note (requires `BypassSandbox: true`):**
   ```bash
   git notes add -m "Task: Implement semantic diagnostic filtering and update ADR-0005 to pass tests (TDD Green phase)
   Summary: Implemented negative stack frame pruning for node_modules/ and runtime internal/ frames in truncate_error_context while strictly preserving user-space frames, TS/ESLint diagnostics, and multi-line assertion diffs, added 3+ newline collapsing to \n\n, lowered default ceiling to 4,000 characters (2,000 head / 2,000 tail), and updated Section 7 of ADR-0005 to document the sanitization and truncation invariants.
   Files: scripts/agent-resolve/agent_resolve/diagnostics.py, docs/adr/0005-autonomous-nightly-agent-workflow.md
   Rationale: Satisfies the Phase 6 TDD Green phase requirements, preventing prompt token bloat and context explosion during autonomous overnight agent resolve loops." $(git log -1 --format="%H")
   ```

3. **Update Track Plan & Commit (`conductor/tracks/agent-resolve-quality-hardening_20261021/plan.md`):**
   Mark Phase 6 Task 2 as completed with the 7-character commit SHA:
   ```bash
   git add conductor/tracks/agent-resolve-quality-hardening_20261021/plan.md
   git commit -m "conductor(plan): Mark task 'Implement semantic diagnostic filtering and update ADR-0005 to pass tests (TDD Green phase)' as complete"
   ```
