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
- Halt for user approval via modal before modifying any files.

#### Optimized Prompt 2: Implementation (Session 2 — Fresh Session)

Execute Phase X Task Y strictly following @conductor/tracks/<track-name>/phase-X-task-Y-plan.md.

Execution Directives (Zero-Amnesia Mode):
1. The plan is 100% authoritative and contains exact drop-in replacements.
2. DO NOT run git log, git show, or view unmentioned files. Proceed immediately to Step 1: apply planned edits to target files using replace_file_content.
3. Run containerized Jest ONCE after all edits are applied (confirm failing tests if Red phase, or passing tests if Green phase).
4. Update plan.md, record git notes, and commit with message: "<git-message>"
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
