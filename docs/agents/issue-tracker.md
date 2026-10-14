# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Briefing Issues for Autonomous Resolution (`agent:resolve`)

Autonomous issue resolution via `.github/workflows/agent-resolve.yml` (and the underlying `scripts/agent-resolve.py` harness) executes a 3-stage TDD pipeline (Architectural Planning -> Red Phase Tests -> Green Phase Implementation). To maximize first-pass success and eliminate hallucinations, maintainers should pre-triage and brief incoming issues using the structured fields in `.github/ISSUE_TEMPLATE/bug_report.yml`:

### Structured Pre-Triage Fields

1. **Target Files & Suspected Components**:
   - Explicit repository-relative paths to files, hooks, or components to inspect or modify.
   - Constrains the Stage 1 Planner's search space and prevents the creation of disconnected, duplicate components or parallel state stores.
2. **Suspected Root Cause & Reproduction Seam**:
   - The concrete runtime mechanism responsible for the bug (e.g., iOS WebKit transient user gesture expiration in async callbacks, race conditions, state desync).
   - Directs the Stage 2 Red Phase executor to author accurate, empirical failing tests targeting the exact failure seam.
3. **Architectural Constraints & Invariants**:
   - Boundaries and non-negotiables for the agent:
     - Component refactoring boundaries (e.g., refactor existing handlers in place rather than creating redundant parallel components).
     - Domain terminology rules from `CONTEXT.md` (e.g., "Trip Navigation" and "Trip Stop", never deprecated aliases).
     - Global architectural invariants from `AGENTS.md` (e.g., coordinate standardization via `lib/utils/winery.ts`, container/presentational separation, offline/PWA compatibility).

### Maintainer Briefing Workflow with `gh`

```bash
# 1. Inspect the incoming issue
gh issue view <number>

# 2. Update the issue body with structured briefing sections
gh issue edit <number> --body-file /path/to/briefed-issue-body.md

# 3. Queue the issue for autonomous resolution in the next batch
gh issue edit <number> --add-label "ready-for-agent,agent:resolve" --remove-label "needs-triage"
```

### Standard `/triage` Prompts for Autonomous Qualification

When running the `/triage` skill to refine submissions and assign labels, use these prompt templates to automatically apply the [Execution Routing Matrix](triage-labels.md#execution-routing-matrix-agentresolve-vs-ready-for-agent):

- **Targeted Single-Issue Triage & Qualification:**
  > `/triage let's look at #<number>. Check the Execution Routing Matrix in docs/agents/triage-labels.md. If it involves pure data/logic refactoring and deterministic unit tests, brief it and add agent:resolve. If it touches UI components, Radix dropdowns, or mobile gestures, brief it for ready-for-agent only for Antigravity CLI.`

- **Batch Overnight Queue Qualification:**
  > `/triage qualify all open ready-for-agent issues against the overnight checklist in docs/agents/triage-labels.md. Promote pure-logic tickets to agent:resolve and flag why UI tickets remain ready-for-agent.`


## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
