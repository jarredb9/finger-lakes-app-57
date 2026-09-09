# Conductor Implementation Quick Reference

Conductor natively handles TDD, git commits, git notes, and plan tracking via `workflow.md`. You only need to provide the **target task** and the **halt boundary** to prevent context blowup.

---

## 1. Standard Invocation (Clean Working Tree)

Use this for almost every task:

```text
/conductor:implement @[conductor/tracks/<track_id>]

Execute Phase <X>, Task <Y> only. Halt after committing.
```

*(Optional: Append the specific test path, e.g. `(target test: lib/.../myTest.test.ts)` to save 2 search tool calls).*

---

## 2. Recovery Invocation (Uncommitted Changes in `git status`)

Use this only if a previous agent was stopped mid-task and left uncommitted files behind:

```text
/conductor:implement @[conductor/tracks/<track_id>]

Pick up uncommitted changes in git status for Phase <X>, Task <Y>.
Verify with tests, commit, update plan.md, and halt.
```
