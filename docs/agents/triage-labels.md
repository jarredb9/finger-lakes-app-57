# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

## Canonical Triage Roles

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, theoretically eligible for an AFK agent |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation or agent failure fallback |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

## Autonomous Overnight Agent Lifecycle

The nightly batch runner (`.github/workflows/agent-resolve.yml`) executes at 20:00 EST (00:00 UTC) against maintainer-authored issues. It uses dedicated lifecycle labels to manage queued work without prematurely triggering runs on issues marked solely as `ready-for-agent`:

| Label in our tracker | Purpose & Lifecycle State |
| -------------------- | ------------------------- |
| `ready-for-agent`    | Static triage tag indicating an issue is fully specified and architecturally suitable for automated resolution. |
| `agent:resolve`      | Active queue tag applied by the maintainer to authorize execution in the next 20:00 EST overnight batch. |
| `agent:in-progress`  | Ephemeral execution tag applied by GitHub Actions while the 3-stage TDD pipeline is running. `agent:resolve` is removed when entering this state. |
| `agent:in-review`    | Success state applied when unit tests and compiler checks pass and an automated Draft PR is opened for maintainer review. `ready-for-agent` and `agent:in-progress` are removed. |
| `ready-for-human`    | Failure fallback state applied if the agent cannot resolve failing tests within 3 attempts or compilation fails. An explanatory log comment is posted and the issue is queued for morning human review. |
