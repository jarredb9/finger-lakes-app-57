# Autonomous Nightly Agent Workflow

Triaged GitHub issues can be resolved overnight using an autonomous multi-stage agent pipeline (`.github/workflows/agent-resolve.yml` and `scripts/agent-resolve.py`) triggered at 20:00 EST (00:00 UTC) or on-demand via `workflow_dispatch`.

To ensure safety on a public repository, control token consumption against Gemini API quotas, and enforce the repository's strict TDD invariants, the workflow adheres to the following principles:

1. **Two-Stage Label Gating**: An issue labeled `ready-for-agent` signifies static triage readiness but will not trigger unattended execution. Only issues explicitly tagged with `agent:resolve` are picked up during the nightly batch (capped at 3 sequential issues per night).
2. **Security & Threat Isolation**:
   - **Author Provenance**: Because the repository is public, issues must be authored by verified repository maintainers (`@jarredb9`) to prevent prompt injection and remote code execution from external issue submissions.
   - **Git Credential Protection**: Configured `actions/checkout@v4` with `persist-credentials: false` so that authorization tokens are never persisted to `.git/config`.
   - **Network-Isolated Test Sandbox**: Verification commands (`npm test`, `npm run type-check`) execute inside an ephemeral Docker container (`node:24-slim`) with `--network none`, matching host UID/GID (`--user "$(id -u):$(id -g)"`), and non-root environment directories (`-e HOME=/tmp -e npm_config_cache=/tmp/.npm`). This completely cuts off outbound network sockets, prevents secret exfiltration from memory or files, and eliminates root-file ownership artifacts.
   - **Path Traversal Protection**: Target file paths are strictly validated against `PROJECT_ROOT` and prohibited from modifying protected paths (`.git/`, `.github/workflows/`, agent scripts).
3. **Structured Schemas & Precision Code Modification**:
   - **Pydantic Validation**: All LLM interactions use strict Pydantic schemas passed to the SDK's `response_schema`: `BlueprintPlan` (Stage 1), `TestFileManifest` (Stage 2), and `PatchManifest` / `PatchChunk` (Stage 3).
   - **Search/Replace Patch Engine & Retry State Hygiene**: Replaced whole-file rewrites in production source code with targeted search/replace patch chunks (`file_path`, `search_block`, `replace_block`). In Stage 3, target source files are transactionally reset back to baseline (`reset_target_sources`) at the start of each retry attempt to eliminate compounding syntax wreckage or anchor mismatches. On mismatch, exact line-level diagnostics are returned to the model during retry loops.
4. **Canonical Model Endpoint & Strict Hard-Stop Policy**:
   - Standardized strictly on **`gemini-3.8-flash`** across all three stages (Planner and Executors).
   - **No Downgrades**: If `gemini-3.8-flash` cannot be reached or returns an unrecoverable API error, the harness halts immediately (no fallbacks to 2.5 or 1.5). The issue is degraded to `ready-for-human` with error diagnostics posted for morning triage.
   - **Resilient Jitter Backoff**: Transient HTTP 429 (`ResourceExhausted`), 503, and capacity errors trigger exponential backoff with randomized full jitter (up to 60s).
   - **Inter-Issue Batch Pacing**: A configurable pacing delay (default 5s) separates sequential batch issues to avoid rate bursts.
5. **Token Budget & Observability**:
   - Each issue is constrained to a hard token budget cap (`MAX_TOKENS_PER_ISSUE = 500,000`) to prevent runaway API spend.
   - Token metrics (prompt, candidates, cached, total) and execution duration are tracked and recorded in the resulting Draft PR body and issue comments.
6. **Git Workspace Isolation & Branch Idempotency**:
   - Each issue starts from a fresh reset of `origin/main` (`git reset --hard`, `git clean -fd`).
   - If an open PR on `agent/issue-<num>` is already labeled `agent:in-review`, the issue is skipped unless explicitly re-queued with `agent:resolve`.
   - Successful resolutions push their isolated feature branch (`agent/issue-<num>`) and immediately reset the working tree back to `main`, ensuring subsequent batch issues branch strictly from `main` without cross-contamination.
   - On unrecoverable errors, the local feature branch is deleted, untracked artifacts are purged, and the working tree returns to `main`.
7. **TDD Compiler, Self-Correction & Regression Gates**: 
   - **Stage 1 (Architectural Blueprint)**: Formulates `task-plan.md`, explicit target files, and conventional commit scope (`gemini-3.8-flash`), grounded by an automated repository source inventory (`get_repository_tree`) alongside `CONTEXT.md` and `AGENTS.md`. Commits `docs(plan): ...`.
   - **Stage 2 (Red Phase)**: Authors unit/component tests in target test files (`TestFileManifest.files`). For brand new source files in `target_src_files` that do not yet exist on disk, authors minimal TypeScript type declarations and function stubs throwing `'Not implemented'` (`TestFileManifest.source_stubs`) so that newly authored test imports compile cleanly (exit 0) and fail targeted `jest` execution (non-zero exit). Features a 2-attempt self-correction loop for TypeScript compilation errors (`npm run type-check`). Commits `test(<scope>): ...`.
   - **Stage 3 (Green Phase)**: Implements minimal application code via search/replace patches with up to 3 self-correction iterations against targeted tests.
   - **Mandatory Full Regression Gate**: Before committing `feat(<scope>): ...` and opening the PR, the agent must pass the entire test suite (`npm test`) and full compiler check (`npm run type-check`) cleanly inside the isolated container.
8. **Downstream CI Triggering & Review Lifecycle**:
   - **Native CI Status Checks**: The workflow attempts to mint an ephemeral token via `actions/create-github-app-token@v1` using `APP_ID` and `APP_PRIVATE_KEY` secrets. Creating the Draft PR with this token natively triggers downstream `.github/workflows/ci.yml` runs. If App secrets are missing, it falls back to `GITHUB_TOKEN`.
   - On success, the pipeline submits a Draft Pull Request requesting review from `@jarredb9` and tags the issue `agent:in-review`. On failure, the remote branch is omitted, the issue is downgraded to `ready-for-human`, and diagnostic test logs are commented on the issue for morning triage.
