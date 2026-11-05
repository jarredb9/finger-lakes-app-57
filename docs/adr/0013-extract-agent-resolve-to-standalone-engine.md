# ADR-0013: Extract `agent-resolve` into Standalone Engine Repository

## Context

The repository currently includes `scripts/agent-resolve/` (13,653 LOC, 75.6% of `scripts/`), introducing Python 3.12 dependencies (`requirements-agent.txt`), custom unit test suites, and significant cognitive and maintenance overhead to an otherwise pure Next.js 16 / TypeScript / Supabase application.

While built as an in-repo autonomous TDD resolver, the underlying 4-stage state machine (Diagnose → Plan → Red → Green) and diff-patch engine are decoupled from the winery domain model. Retaining it in this product repository contributes to process overhead and architectural debt without product feature benefits.

## Decision

Extract `scripts/agent-resolve/` out of `jarredb9/finger-lakes-app-57` into a standalone, reusable repository (`jarredb9/agent-resolve`) utilizing a contract-based runner pattern (tracked in [Issue #85](https://github.com/jarredb9/finger-lakes-app-57/issues/85)).

### Target Architecture
1. **Engine Repository (`jarredb9/agent-resolve`):**
   - Owns language-agnostic AI orchestration, Gemini LLM schemas, token budgeting, and the TDD Git state machine.
   - Packaged as a reusable GitHub Action (`action.yml`) and CLI runner.
2. **Consuming Repository Contract (`finger-lakes-app-57`):**
   - Pure declarative configuration (`.agent-resolve.json`) specifying local test commands (`./scripts/containers/run-jest-container.sh {test_files}`), lint commands, and protected paths.
   - Removes `scripts/agent-resolve/`, `requirements-agent.txt`, and Python `test:agent` scripts from `package.json`.

## Consequences

- **Positive:**
  - Reduces repository line count by ~13.6k LOC.
  - Eliminates host Python 3.12 requirements for web application contributors.
  - Restores sharp focus to the Winery Visit Planner domain and App Router architecture.
  - Enables reuse of the autonomous TDD resolver across multiple independent projects.
- **Negative:**
  - Requires cross-repository versioning and coordinated release management for agent tooling updates.
