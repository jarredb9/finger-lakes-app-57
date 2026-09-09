# Conductor Implementation Prompts & Operating Guide

Use these prompt templates with `/conductor:implement` to prevent unbounded agent execution, context bloat, and runaway loops.

---

## 1. The Default Best-Practice Prompt (Single Task Execution)

Use this as your standard invocation for each task in a track:

```text
/conductor:implement @[conductor/tracks/<track_id>]

Execute ONLY the next pending task in plan.md.

Operational constraints:
1. Follow TDD: confirm failing tests (Red), implement minimal fix (Green), verify clean test suite.
2. Stage and commit the task changes, attach a git note summary, and record the commit SHA in plan.md.
3. Two-Strike Rule: If compilation or test errors persist after 2 attempts, HALT and report the blocker instead of looping.
4. HALT immediately after committing and updating plan.md. Do not begin the next task without confirmation.
```

---

## 2. Cohesive TDD Pair Prompt (Red + Green Together)

When Task 1 writes failing tests and Task 2 implements the code to pass them, keep them in the same session:

```text
/conductor:implement @[conductor/tracks/<track_id>]

Execute Phase <X>, Task <1> (Write failing tests) and Task <2> (Implementation) only.

Operational constraints:
1. Complete Task 1, commit tests, attach git note, and update plan.md.
2. Complete Task 2 to make tests pass, commit implementation, attach git note, and update plan.md.
3. Two-Strike Rule: If tests or builds fail after 2 fix attempts, HALT and report the blocker.
4. HALT immediately after Task 2 is committed. Do not proceed to downstream tasks without confirmation.
```

---

## 3. Fresh Agent Handoff Prompt (Mid-Phase Recovery)

When an agent reaches >80 turns, gets confused, or when picking up working tree changes in a fresh session:

```text
/conductor:implement @[conductor/tracks/<track_id>]

We are resuming Phase <X>, Task <Y>: "<Task Name>".

Context & Current State:
- Previous tasks are committed in git.
- Review `git status` for uncommitted working tree progress.
- Verify changes with: `npm run type-check` and `<targeted_test_command>`.

Instructions:
1. Inspect the existing diff and ensure tests/type-checks pass.
2. Stage and commit the task changes with git note summary.
3. Update plan.md with the commit SHA and mark the task complete `[x]`.
4. HALT for review. Do not proceed to the next task.
```

---

## 4. The 3 Lifecycle Decision Rules

At the end of every task, spend 10 seconds checking your terminal:

1. **When to Keep the Same Agent:**
   - The session has run for **< 60 turns**.
   - The next task is the immediate Green implementation of tests just written, OR follows the identical pattern of the task just completed (e.g. `tripStore` slice $\to$ `visitStore` slice).
   - Prompt: *"Proceed to the next task in plan.md following the same constraints."*

2. **When to Start a Fresh Agent:**
   - The session has exceeded **80–100 turns** or **> 100k tokens**.
   - The next task pivots domains (e.g. from `lib/stores/` state slices to `components/` UI rendering).
   - The previous task required a messy multi-turn debugging cycle.
   - Close the session and launch a fresh agent using Template 1.

3. **When to Demand a Subagent:**
   - If an agent starts reading or grepping across 10+ files in the primary chat, interrupt and prompt:
     > *"Delegate this discovery to a research subagent. Return a concise summary of affected files and keep raw file contents out of this thread."*
