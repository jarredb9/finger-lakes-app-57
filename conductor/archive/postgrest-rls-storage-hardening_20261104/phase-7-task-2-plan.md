# Implementation Plan: Phase 7 Task 2 — Add Exponential Backoff Retry Logic to Container Runners

**Track:** `postgrest-rls-storage-hardening_20261104` (Issue [#93](https://github.com/jarredb9/finger-lakes-app-57/issues/93))  
**Phase:** 7 (Wire CI/CD Verification Gates & Docker Reliability — Verification & CI/CD)  
**Task:** 2 (Add exponential backoff retry logic to container runners)  
**Preceding Context:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/phase-7-task-1-plan.md](./phase-7-task-1-plan.md)  
**ADR References:**
- [docs/adr/0006-containerized-ios-pwa-emulation-testing.md](../../../docs/adr/0006-containerized-ios-pwa-emulation-testing.md)
- [docs/adr/0009-container-runner-playwright-coupling.md](../../../docs/adr/0009-container-runner-playwright-coupling.md)  
**Domain Context:** [CONTEXT.md](../../../CONTEXT.md)  
**Specification Reference:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/spec.md](./spec.md) Section 3.10  
**Track Plan Reference:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md](./plan.md) lines 111–114  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Enhance container image provisioning resilience in the shared container runner library (`scripts/containers/container-common.sh`) to eliminate transient network failures and registry throttling from aborting container runs across local developer environments and CI/CD pipelines:

1. **Transient Network Fault Tolerance & Exponential Backoff:**
   - Update `ensure_container_image()` in `scripts/containers/container-common.sh` to wrap `podman pull` and `docker pull` in a 3-attempt retry loop with exponential backoff progression (2s, 4s, 8s).
   - Retain the zero-network fast-path: if the image already exists locally in Podman storage (`podman image exists`) or Docker daemon cache (`docker image inspect`), return immediately without network access or backoff delay.
2. **High-Signal Observability & Clean Failure Reporting:**
   - Emit progress indicators on stdout for initial pull and subsequent retry attempts: `📥 Pulling $label (attempt $attempt/$max_attempts)...`.
   - Log retry warnings to stderr: `⚠️  Pull failed for $label (attempt $attempt/$max_attempts). Retrying in ${backoff}s...`.
   - On retry exhaustion (all 3 attempts failed), emit clean error reporting to stderr (`❌ Error: Failed to pull $label after $max_attempts attempts.`) and return exit status `1` to trigger container runner error traps and clean process shutdown.
3. **Deterministic Unit Testing & Test Hook Configuration:**
   - Introduce configurable environment variable hooks (`CONTAINER_PULL_MAX_ATTEMPTS`, defaulting to `3`; `CONTAINER_PULL_INITIAL_BACKOFF`, defaulting to `2`) so unit test harnesses can test retry loops and failure modes without sleeping real seconds.
   - Expand `scripts/__tests__/run-container.test.sh` with unit tests covering local-cache skips, immediate pull success, transient failure retry recovery, and retry exhaustion error paths.
   - Align version string assertions in `scripts/__tests__/run-container.test.sh` with current `PLAYWRIGHT_VERSION` (`v1.64.1-noble` per [ADR-0009](../../../docs/adr/0009-container-runner-playwright-coupling.md)).

### 1.2 Architectural & Operational Context
- All containerized operations on RHEL 8 (Jest unit tests via `run-jest-container.sh`, dev server via `run-dev-container.sh`, production builds via `run-build-container.sh`, and Playwright E2E via `run-e2e-container.sh`) rely on `scripts/containers/container-common.sh` to detect the engine (Podman locally, Docker in CI) and ensure image availability.
- Microsoft Container Registry (`mcr.microsoft.com/playwright`) occasionally experiences transient TCP socket resets, TLS handshake timeouts, or rate limits during automated runner initialization. Without retry logic, a single momentary network blip halts test runs or builds.
- Wrapping image pulls in an exponential backoff loop guarantees automated self-healing for transient failures while ensuring deterministic and graceful termination when connectivity is truly down.

---

## 2. Invariants & Critical Guardrails

1. **Production Database Safety ([AGENTS.md](../../../AGENTS.md) Critical Guardrail 1):**
   - Strictly zero migrations, DDL, or DML mutations executed against the remote Supabase project (`jfsxclrdxmvftxacjuqf`). Container runners operate strictly against local or mock environments.
2. **BypassSandbox Mandates ([AGENTS.md](../../../AGENTS.md) Section 3):**
   - In standard AI agent sandboxes, `/run` user namespaces and rootless container sockets are restricted. When executing container runners (`run-jest-container.sh`, `run-build-container.sh`, `run-e2e-container.sh`), commands must execute with `BypassSandbox: true`. Read-only script inspection and unit test validation on mock binaries stay sandboxed (`BypassSandbox: false`).
3. **Fast-Path Zero-Network Invariant:**
   - When the target container image is already present in the local container store (`podman image exists` or `docker image inspect`), `ensure_container_image()` MUST exit with status `0` immediately without calling `pull`, without printing pull status, and without sleeping.
4. **Deterministic Exponential Backoff Progression:**
   - Attempt 1: Execute pull. If success -> return 0. If fail -> log retry warning to stderr, sleep `2s`, set next backoff to `4s`.
   - Attempt 2: Execute pull. If success -> return 0. If fail -> log retry warning to stderr, sleep `4s`, set next backoff to `8s`.
   - Attempt 3: Execute pull. If success -> return 0. If fail -> DO NOT sleep. Emit exhausted error to stderr and return 1.
5. **Standard Stream Separation:**
   - Informational progress messages (`📥 Pulling ...`) write to stdout.
   - Retry warnings (`⚠️  ...`) and final error reporting (`❌ Error: ...`) write to stderr (`>&2`).
6. **Modal Approval Invariant (`conductor_antigravity.md` & [AGENTS.md](../../../AGENTS.md) Section 2):**
   - Halt immediately for explicit affirmative user approval via the `ask_question` modal before modifying any files on disk.

---

## 3. Target Files & Semantic Insertion Anchors

### 3.1 Target 1: Container Runner Common Library
- **Path:** `scripts/containers/container-common.sh`
- **Semantic Insertion Anchors:**
  1. **Anchor 1 (`ensure_container_image()` function definition):**
     - *Location:* Lines 61–77.
     - *Replacement:* Replace the existing static pull block with the 3-attempt exponential backoff loop, supporting `CONTAINER_PULL_MAX_ATTEMPTS` (default `3`) and `CONTAINER_PULL_INITIAL_BACKOFF` (default `2`), zero-network fast-path check, progress logging, and clean stderr error reporting on exhaustion.

### 3.2 Target 2: Container Runner Unit Test Suite
- **Path:** `scripts/__tests__/run-container.test.sh`
- **Semantic Insertion Anchors:**
  1. **Anchor 1 (Mock Container Engine Enhancements):**
     - *Location:* Lines 23–48 (`podman` mock) and Lines 50–76 (`docker` mock).
     - *Insertion:* Add support for `MOCK_IMAGE_EXISTS` (default `true`, if `false` returns 1 on existence check) and `MOCK_PULL_FAIL_COUNT` (tracks invocation count via state file; fails until threshold is exceeded, logging `PULL: $image` to `$MOCK_LOG`).
  2. **Anchor 2 (Playwright Version Assertion Alignment):**
     - *Location:* Lines 270–275 in `test_common_vars()`.
     - *Update:* Align expected output from stale `v1.63.0-noble` to current `v1.64.1-noble` per `container-common.sh:8` and [ADR-0009](../../../docs/adr/0009-container-runner-playwright-coupling.md).
  3. **Anchor 3 (New `ensure_container_image()` Unit Tests):**
     - *Location:* Before Line 313 (`echo "=== Test Results: $PASSED passed, $FAILED failed ==="`).
     - *Insertion:* Add comprehensive unit tests:
       - `test_ensure_container_image_cached()`: Verifies zero pulls when image exists.
       - `test_ensure_container_image_pull_immediate_success()`: Verifies 1 pull attempt and success without backoff sleep.
       - `test_ensure_container_image_pull_retry_success()`: Verifies retry on initial failure, warning emission to stderr, and eventual success.
       - `test_ensure_container_image_pull_exhausted_retries()`: Verifies 3 attempts, warning logs, final failure error reporting on stderr, and non-zero exit status (`1`).

### 3.3 Target 3: Track Plan
- **Path:** `conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md`
- **Semantic Insertion Anchor:** Under `## Phase 7: Wire CI/CD Verification Gates & Docker Reliability (Verification & CI/CD)` (lines 111–114):
  Mark task and all subtasks as complete `[x]` with commit hash.

---

## 4. Blueprint Signatures & Interfaces

### 4.1 Bash Function Contracts & Environment Configuration (`scripts/containers/container-common.sh`)

```bash
# -----------------------------------------------------------------------------
# Function: ensure_container_image
# Purpose: Ensures target container image exists locally or pulls it with exponential
#          backoff retry (2s, 4s, 8s).
# Arguments:
#   $1 (target_image, optional): Container image reference (defaults to $IMAGE)
#   $2 (label, optional): Human-readable image label for logging
# Environment Variables:
#   CONTAINER_PULL_MAX_ATTEMPTS: Maximum pull attempts (default: 3)
#   CONTAINER_PULL_INITIAL_BACKOFF: Initial backoff delay in seconds (default: 2)
#   ENGINE: Container engine to execute with ("podman" | "docker")
# Returns:
#   0: Image exists or was successfully pulled
#   1: Failed to pull image after all retry attempts exhausted
# -----------------------------------------------------------------------------
ensure_container_image() {
    local target_image="${1:-$IMAGE}"
    local label="${2:-image $target_image}"
    # ... implementation per behavioral logic ...
}
```

### 4.2 Mock Environment Contract for Testing (`scripts/__tests__/run-container.test.sh`)

```bash
# Environment hooks honored by mock podman and mock docker:
#   MOCK_IMAGE_EXISTS: "true" (default) -> image exists; "false" -> image missing
#   MOCK_PULL_FAIL_COUNT: Integer N -> first N pull invocations fail with exit 1; subsequent succeed
#   MOCK_LOG: Path to log file recording executed commands (CMD:, VOL:, ENV:, PULL:)
#   CONTAINER_PULL_INITIAL_BACKOFF: Set to 0 in tests to eliminate sleep delay
```

---

## 5. Precise Behavioral Logic & State Transitions

### 5.1 Retry & Backoff State Machine Flow

```
                      +-----------------------------+
                      |   ensure_container_image()  |
                      +-----------------------------+
                                     |
                                     v
                       [ ENGINE variable set? ]
                           /              \
                     No  /                  \ Yes
                        v                    v
              detect_container_engine()      |
                        \                    /
                         +--------+---------+
                                  |
                                  v
                  [ Image exists in local store? ]
                     (podman image exists OR
                      docker image inspect)
                           /              \
                    Yes  /                  \ No
                        v                    v
                 +------------+    +-----------------------------+
                 |  return 0  |    | attempt = 1                 |
                 +------------+    | backoff = 2                 |
                   (Fast Path)     | max_attempts = 3            |
                                   +-----------------------------+
                                                 |
                       +-------------------------+<--------------------------+
                       |                                                     |
                       v                                                     |
          +------------------------------------+                             |
          | Print attempt progress to stdout:  |                             |
          | "📥 Pulling $label..."             |                             |
          +------------------------------------+                             |
                       |                                                     |
                       v                                                     |
            [ $ENGINE pull succeeds? ]                                       |
                  /             \                                            |
            Yes /                 \ No                                       |
               v                   v                                         |
        +------------+   [ attempt < max_attempts? ]                         |
        |  return 0  |          /              \                             |
        +------------+    Yes /                  \ No (Exhausted)            |
                             v                    v                          |
        +----------------------------+   +---------------------------------+ |
        | Log warning to stderr:     |   | Log error to stderr:            | |
        | "⚠️  Pull failed...        |   | "❌ Error: Failed to pull...   | |
        |     Retrying in ${backoff}s"   |     after 3 attempts."          | |
        | sleep "$backoff"           |   +---------------------------------+ |
        | backoff = backoff * 2      |                    |                  |
        | attempt = attempt + 1      |                    v                  |
        +----------------------------+             +------------+            |
                       |                           |  return 1  |            |
                       |                           +------------+            |
                       +-----------------------------------------------------+
```

### 5.2 Mathematical Formulation of Backoff Delays
The delay following each failed attempt $k \in \{1, \dots, \text{max\_attempts} - 1\}$ is computed as:
$$\text{delay}(k) = \text{initial\_backoff} \times 2^{k - 1}$$
With default $\text{initial\_backoff} = 2$:
- Following Attempt 1 failure ($k=1$): $\text{delay}(1) = 2 \times 2^0 = 2\text{s}$
- Following Attempt 2 failure ($k=2$): $\text{delay}(2) = 2 \times 2^1 = 4\text{s}$
- Following Attempt 3 failure ($k=3$): Attempt count equals $\text{max\_attempts}$ (3); loop terminates without sleep ($0\text{s}$ delay) and immediately reports failure. If $\text{max\_attempts}$ were extended to 4, $\text{delay}(3) = 8\text{s}$.

### 5.3 Error Handling & Edge Cases
1. **Unset Engine Variable:** If `ENGINE` is empty when `ensure_container_image` is invoked (e.g. called directly without `setup_container_engine`), `detect_container_engine` is automatically called.
2. **Signal Interruption During Sleep:** When a user issues `SIGINT` (Ctrl+C) or `SIGTERM` during a backoff sleep, the calling container runner trap captures the signal and invokes `restore_supabase_selinux` for clean state restoration.
3. **Empty or Missing Image Label:** If label argument is omitted, defaults to `"image $target_image"`, maintaining clean and descriptive log output.
4. **Caller Error Handling with `set -e`:** When all attempts fail, returning status `1` causes any script executing under `set -e` (all 4 container runners) to abort immediately and invoke the `trap cleanup EXIT` handler, preventing dangling containers or orphaned temporary mounts.

---

## 6. Execution Verification Protocol

Perform empirical verification using the following commands:

### 6.1 Bash Script Syntax Validation
Verify that `scripts/containers/container-common.sh` and `scripts/__tests__/run-container.test.sh` are syntactically valid bash scripts:
```bash
bash -n scripts/containers/container-common.sh
bash -n scripts/__tests__/run-container.test.sh
```
*Expected Result:* Zero syntax errors with exit code 0.

### 6.2 Unit Test Execution for Container Runners & Backoff Logic
Run the dedicated container runner unit test suite:
```bash
./scripts/__tests__/run-container.test.sh
```
*Expected Result:*
- All 16 existing argument parsing, zero-argument default, and volume mounting tests PASS.
- `PLAYWRIGHT_VERSION` assertion matches `v1.64.1-noble` and PASSES.
- All new `ensure_container_image()` tests (cached skip, immediate pull, transient retry recovery, and exhausted error paths) PASS.
- Overall scorecard outputs `=== Test Results: N passed, 0 failed ===` with exit code 0.

### 6.3 End-to-End Container Runner Smoke Verification (BypassSandbox Mandate)
Run a fast containerized unit test using rootless Podman to verify that `ensure_container_image()` integrates cleanly in live container runner execution per [AGENTS.md](../../../AGENTS.md) Section 3:
```bash
./scripts/containers/run-jest-container.sh lib/utils/__tests__/pointer-capture-patch.test.ts
```
*Expected Result:* Jest test passes cleanly inside the container runner with exit code 0.

---

## 7. Post-Execution Protocol & Git Notes

Upon confirming all verifications pass cleanly:

### 7.1 Stage & Commit
```bash
git add scripts/containers/container-common.sh scripts/__tests__/run-container.test.sh
git commit -m "feat(ci): add exponential backoff retry logic to container runners"
```

### 7.2 Attach Git Note
Obtain commit hash (`COMMIT_HASH=$(git log -1 --format="%H")`) and attach the standard metadata note:

```bash
git notes add -m "Task: Add exponential backoff retry logic to container runners
Summary: Updated ensure_container_image() in scripts/containers/container-common.sh to wrap podman pull and docker pull in a 3-attempt retry loop with exponential backoff progression (2s, 4s, 8s). Added progress logging to stdout, warning logs on retries to stderr, and clean error reporting on retry exhaustion. Added configurable test hooks for max attempts and initial backoff. Updated scripts/__tests__/run-container.test.sh with mock pull failure simulation, Playwright version alignment, and comprehensive unit tests for local cache hits, immediate pull, retry recovery, and exhaustion.
Files: scripts/containers/container-common.sh, scripts/__tests__/run-container.test.sh
Rationale: Closes Issue #93 Phase 7 Task 2, preventing transient network glitches or container registry rate limits from aborting automated container test runs and builds." $COMMIT_HASH
```

### 7.3 Update Conductor Plan
Update `conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md`:
- Mark `[ ] Task: Add exponential backoff retry logic to container runners` and all subtasks as `[x]` with commit hash.
- Stage `conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md`.
- Commit with: `chore(conductor): Mark task 'Add exponential backoff retry logic to container runners' as complete`.

---

## 8. Confirmation Gate

Halt immediately. Do NOT modify any implementation files (`scripts/containers/container-common.sh`, `scripts/__tests__/run-container.test.sh`) until explicit affirmative user approval is received via the `ask_question` modal.