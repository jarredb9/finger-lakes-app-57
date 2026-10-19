# Repository Scripts Directory

This directory contains build, test, container, database, CI, and AI agent automation scripts for the Winery Visit Planner & Tracker project.

---

## Directory Organization

```text
scripts/
├── agent-resolve/          # Autonomous issue resolution harness
├── agent/                  # Conductor prompt generation & session observability
├── ci/                     # CI workflow simulation & telemetry
├── containers/             # Rootless Podman container runners (RHEL 8 / glibc compatibility)
├── db/                     # Supabase database seeding, enrichment, audits, and RPC diagnostics
│   └── users/              # Auth & test user provisioning
├── dev/                    # Workstation & browser developer utilities
└── __tests__/              # Automated test suites for script infrastructure
```

---

## Subdirectory Details

### 1. `containers/` (Container Execution Infrastructure)
Provides isolated rootless container runners to bypass RHEL 8 host glibc limitations (`glibc < 2.29` incompatible with Next.js 16 SWC binaries).
* **`container-common.sh`**: Shared configuration, engine detection (Podman/Docker), SELinux (`:Z`), and Playwright image versioning.
* **`run-jest-container.sh`**: Runs Jest unit/integration tests in an isolated Node container (`npm run test:container`).
* **`run-e2e-container.sh`**: Runs Playwright E2E suites across browsers (`chromium`, `webkit`, `mobile-safari`, `all`).
* **`run-dev-container.sh`**: Boots Next.js Turbopack dev server in a container (`npm run dev:container`).
* **`run-build-container.sh`**: Executes production Next.js builds with native SWC (`npm run build:container`).

### 2. `db/` (Database & Data Operations)
* **`populate-wineries.ts`**: Seeds initial winery data into Supabase (`npm run db:populate`).
* **`enrich-existing-wineries.ts`**: Enriches basic winery rows with Google Places / details.
* **`cleanup-test-data.ts`**: Purges mock records created during automated or manual test runs.
* **`db-audit.sh`**: Lints database migrations, verifies local TypeScript types, and checks schema drift against remote (`npm run db:audit`).
* **`debug-rpc.ts`**: Ad-hoc diagnostic tool for testing Supabase PostgreSQL RPC responses.
* **`users/create-test-users.js`**: Provisions automated test user accounts into Supabase Auth.
* **`users/create-manual-test-user.js`**: Generates a single test user credential set for manual QA.

### 3. `ci/` (Continuous Integration)
* **`simulate-ci.sh`**: Builds the production bundle and runs Playwright shards locally against a background production server.
* **`ci-step-timer.sh`**: Profiles GitHub Actions run step durations across sharded jobs using the `gh` CLI.

### 4. `agent-resolve/` (Autonomous Issue Resolver)
A modular Python package and CLI harness that plans, executes failing tests (Red), and patches application code (Green) against triaged GitHub issues within [.github/workflows/agent-resolve.yml](file:///home/byrnesjd4821/Git/finger-lakes-app-57/.github/workflows/agent-resolve.yml).

```text
scripts/agent-resolve/
├── pyproject.toml              # PEP 621 packaging metadata & console entrypoint
├── agent-resolve.py            # Backward-compatible thin executable CLI shim
├── agent_resolve/              # Decomposed core modular package
│   ├── config.py, models.py, tracker.py, exceptions.py, environment.py
│   ├── verification.py, patch_engine.py, vcs.py, llm.py, context.py
│   ├── diagnostics.py, stages/, pipeline.py, cli.py
└── tests/                      # Modular unit and integration test suites
```

* **Complete 4-Stage Pipeline**:
  * **Stage 0: Diagnostic Exploration (`stage_0_diagnose`)**: Autonomous read-only exploration loop (`grep_search`, `find_files`, `read_file_snippet`) producing structured `DiagnosticResult`.
  * **Stage 1: Architectural Blueprint (`stage_1_plan`)**: Grounded planning producing `task-plan.md`, explicit target files, and conventional commit scope informed by diagnostics.
  * **Stage 2: Red Phase Tests (`stage_2_red`)**: Generates compiling stubs (`TS6133`-compliant) and failing tests (`validate_jest_red_phase`), with **Tier 3 Blueprint Invalidation** fallback if test authoring hits an unrecoverable architectural impasse.
  * **Stage 3: Green Phase Implementation (`stage_3_green`)**: Two-tier fuzzy search/replace patching, iterative test feedback, and mandatory full regression gate (`npm test` and `npm run type-check`).
* **Developer Testing Workflows**:
  * `npm run test:agent`: Runs modular unit and integration test suites in `scripts/agent-resolve/tests/`.
  * `npm run test:agent:all`: Dual execution of legacy regression tests (`scripts/__tests__/test_patch_engine.py`) and modular test suites.
  * CLI shim direct invocation: `python3.12 scripts/agent-resolve/agent-resolve.py --help` or console script `agent-resolve`.

### 5. `agent/` (Agent Tooling & Observability)
* **`generate-prompt.py`**: Generates optimized Planner and Executor prompts for Conductor tracks (`npm run conductor:prompt`).
* **`inspect-session.mjs` / `inspect-session.sh`**: CLI session inspector for Antigravity-CLI transcript logs (`npm run session:inspect`).

### 6. `dev/` (Workstation Utilities)
* **`chrome-webgl.sh`**: Launches Google Chrome with SwiftShader software WebGL flags for testing map render fallback modes on headless or non-GPU machines.

### 7. `__tests__/` (Script Unit & Regression Tests)
* **`run-container.test.sh`**: Verifies CLI argument parsing, zero-argument safety, and volume masking regression tests across container runners.
* **`test_patch_engine.py`**: Unit tests for the search/replace patch engine and safe path traversal resolution.

---

## Primary Invocations

All scripts should be invoked via their domain paths or their `package.json` script hooks:
* Container runners: `npm run test:container`, `npm run dev:container`, `npm run build:container` or `./scripts/containers/run-*.sh`
* Database operations: `npm run db:populate`, `npm run db:audit` or `npx tsx scripts/db/<script>.ts`
* AI & Conductor tools: `npm run conductor:prompt`, `npm run session:inspect` or `python3 scripts/agent/<script>.py`

