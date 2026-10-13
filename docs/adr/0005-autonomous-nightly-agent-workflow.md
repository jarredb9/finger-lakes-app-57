# Autonomous Nightly Agent Workflow

Triaged GitHub issues can be resolved overnight using an autonomous multi-stage agent pipeline (`.github/workflows/agent-resolve.yml` and `scripts/agent-resolve.py`) triggered at 20:00 EST (00:00 UTC) or on-demand via `workflow_dispatch`. 

To ensure safety on a public repository, control token consumption against Gemini API quotas, and enforce the repository's strict TDD invariants, the workflow adheres to the following principles:

1. **Two-Stage Label Gating**: An issue labeled `ready-for-agent` signifies static triage readiness but will not trigger unattended execution. Only issues explicitly tagged with `agent:resolve` are picked up during the nightly batch (capped at 3 sequential issues per night).
2. **Security & Threat Isolation**:
   - **Author Provenance**: Because the repository is public, issues must be authored by verified repository maintainers (`@jarredb9`) to prevent prompt injection and remote code execution from external issue submissions.
   - **Defense-in-Depth Secret Scrubbing**: All sensitive credentials (`GEMINI_API_KEY`, `GH_TOKEN`, `GITHUB_TOKEN`, database keys) are scrubbed from the environment before executing test commands (`npm test`, `npm run type-check`).
   - **Path Traversal Protection**: Target file paths are strictly validated against `PROJECT_ROOT` and prohibited from modifying protected paths (`.git/`, `.github/workflows/`, agent scripts).
3. **Structured Schemas & Type Safety**: Replaced unstructured string parsing with Pydantic models (`BlueprintPlan`, `CodeFileManifest`) passed directly to Google GenAI SDK's `response_schema`. Responses are validated upon arrival, preventing malformed JSON halts.
4. **Resilient Rate-Limit Backoff & Quota Protection**:
   - **Exponential Jitter Retry**: Transient HTTP 429 (`ResourceExhausted`), 503, and capacity errors trigger exponential backoff with randomized full jitter (up to 60s) before falling back across models (`gemini-3.8-flash-high` / `gemini-3.8-flash-medium` -> `gemini-2.5-flash` -> `gemini-1.5-flash`).
   - **Inter-Issue Batch Pacing**: A configurable pacing delay (default 5s) separates sequential batch issues to avoid GitHub API and Gemini RPM bursts.
5. **Token Budget & Observability**:
   - Each issue is constrained to a hard token budget cap (`MAX_TOKENS_PER_ISSUE = 500,000`) to prevent denial-of-wallet loops.
   - Token metrics (prompt, candidates, cached, total) and execution duration are tracked and recorded in the resulting Draft PR body and issue comments.
6. **Git Workspace Isolation**:
   - Each issue starts from a fresh reset of `origin/main` (`git reset --hard`, `git clean -fd`).
   - Successful resolutions push their isolated feature branch (`agent/issue-<num>`) and immediately reset the working tree back to `main`, ensuring subsequent batch issues branch strictly from `main` without cross-contamination.
   - On unrecoverable errors, the local feature branch is deleted, untracked artifacts are purged, and the working tree returns to `main`.
7. **TDD Compiler & Test Gates**: 
   - **Stage 1 (Architectural Blueprint)**: Formulates `task-plan.md`, explicit target files, and conventional commit scope (`gemini-3.8-flash-high`).
   - **Stage 2 (Red Phase)**: Authors unit/component tests in target test files only (`gemini-3.8-flash-medium`). Must pass `npm run type-check` (exit 0) and fail targeted `jest` execution (non-zero exit). Commits `test(<scope>): ...`.
   - **Stage 3 (Green Phase)**: Implements minimal application code to satisfy the tests. Must pass both `npm run type-check` and `jest` within a maximum of 3 self-correction iterations. Commits `feat(<scope>): ...`.
8. **Human Review & Degradation**: On success, the pipeline submits a Draft Pull Request requesting review from `@jarredb9` and tags the issue `agent:in-review`. On unrecoverable failure or token budget exhaustion, the remote branch is omitted, the issue is downgraded to `ready-for-human`, and diagnostic test logs are commented on the issue for morning triage.
