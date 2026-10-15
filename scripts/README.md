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
* **`agent-resolve.py`**: Multi-stage autonomous TDD engine that plans, executes failing tests (Red), and patches application code (Green) against triaged GitHub issues. Invoked in [.github/workflows/agent-resolve.yml](file:///home/byrnesjd4821/Git/finger-lakes-app-57/.github/workflows/agent-resolve.yml).

### 5. `agent/` (Agent Tooling & Observability)
* **`generate-prompt.py`**: Generates optimized Planner and Executor prompts for Conductor tracks (`npm run conductor:prompt`).
* **`inspect-session.mjs` / `inspect-session.sh`**: CLI session inspector for Antigravity-CLI transcript logs (`npm run session:inspect`).

### 6. `dev/` (Workstation Utilities)
* **`chrome-webgl.sh`**: Launches Google Chrome with SwiftShader software WebGL flags for testing map render fallback modes on headless or non-GPU machines.

### 7. `__tests__/` (Script Unit & Regression Tests)
* **`run-container.test.sh`**: Verifies CLI argument parsing, zero-argument safety, and volume masking regression tests across container runners.
* **`test_patch_engine.py`**: Unit tests for the search/replace patch engine and safe path traversal resolution.

---

## Backward Compatibility Symlinks

To avoid breaking active Conductor track plans, prompt generation commands, and developer muscle memory, the root of `scripts/` contains relative symlinks forwarding to their respective domain locations:

* `scripts/run-*-container.sh` ➔ `containers/run-*-container.sh`
* `scripts/agent-resolve.py` ➔ `agent-resolve/agent-resolve.py`
* `scripts/generate-prompt.py` ➔ `agent/generate-prompt.py`
* `scripts/populate-wineries.ts` ➔ `db/populate-wineries.ts`
* `scripts/db-audit.sh` ➔ `db/db-audit.sh`
* ...and all other historical script paths.
