# Conductor Implementation Quick Reference

Conductor natively handles TDD, git commits, git notes, and plan tracking via `workflow.md`. You only need to provide the **target task** and the **halt boundary** to prevent context blowup.

---

## 1. Standard Invocation (Clean Working Tree)

Use this for almost every task:

```text
#### Optimized Prompt 1: Research & Plan (Session 1)

/conductor:implement @[conductor/tracks/<track-name>] Plan Phase X Task Y only.

Gate & Planning Protocol:
- Perform static inspection only (NO test runners, build commands, or background docs). Seam-bounded inspection.
- Write the implementation plan directly to: conductor/tracks/<track-name>/phase-X-task-Y-plan.md
- CRITICAL: The plan must provide EXACT drop-in code blocks (imports, functions, replacement chunks) and precise line anchors for target files so the executor does not need to inspect surrounding files.
- CRITICAL: If introducing or modifying test files (unit, integration, or E2E), the plan's Execution Verification Protocol MUST specify the exact command to run those tests (e.g. ./scripts/run-e2e-container.sh webkit <spec> or ./scripts/run-jest-container.sh <test>). Never leave new test code unverified in the execution phase.
- Halt for user approval via modal before modifying any files.

#### Optimized Prompt 2: Implementation (Session 2 — Fresh Session)

Execute Phase X Task Y strictly following @conductor/tracks/<track-name>/phase-X-task-Y-plan.md.

Execution Directives (Seam-Bounded & Empirically Verified):
1. The plan is 100% authoritative. Stay strictly within the planned seam (DO NOT view unmentioned files or explore git history).
2. Proceed immediately to apply planned additions or edits using write_to_file or replace_file_content.
3. Targeted Verification:
   - Run targeted test runner for created/modified files (e.g. Jest container for unit tests, Playwright container for E2E, Deno for Edge Functions).
   - If tests fail, diagnose within the target seam, adjust code/fixtures, and re-verify. Do NOT commit failing tests.
4. Once verified, update plan.md, record git notes, and commit with message: "<git-message>"
5. Halt immediately after commit.
```

### CLI Prompt Generator (Instant Copy-Paste)

You can generate and copy these prompts instantly using `scripts/generate-prompt.py`:

```bash
# Auto-detect active track and next pending task:
python3 scripts/generate-prompt.py

# Specify Phase and Task for active track:
python3 scripts/generate-prompt.py 3 1

# Copy directly to clipboard:
python3 scripts/generate-prompt.py 3 1 --copy-plan   # Copies Plan prompt
python3 scripts/generate-prompt.py 3 1 --copy-exec   # Copies Exec prompt
```
---

## 2. Recovery Invocation (Uncommitted Changes in `git status`)

Use this only if a previous agent was stopped mid-task and left uncommitted files behind:

```text
/conductor:implement @[conductor/tracks/<track_id>]

Pick up uncommitted changes in git status for Phase <X>, Task <Y>.
Verify with tests, commit, update plan.md, and halt.
```
