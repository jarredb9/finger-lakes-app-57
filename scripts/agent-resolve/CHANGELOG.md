# agent-resolve Changelog

All notable changes to the `agent-resolve` autonomous issue resolution tool are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security
* Closed Docker sandbox escape by passing `--no-verify` to automated Git commits and adding `--ignore-scripts` to workflow dependencies ([#97](https://github.com/jarredb9/finger-lakes-app-57/issues/97)).
* Enforced positive directory and extension allowlists for target source files and expanded protected configuration paths ([#97](https://github.com/jarredb9/finger-lakes-app-57/issues/97)).
* Hardened subprocess execution to fail closed in CI without Docker, scrubbed default environment credentials while preserving `GH_TOKEN` for `gh` CLI commands, and added `--` argument delimiters ([#97](https://github.com/jarredb9/finger-lakes-app-57/issues/97)).
* Expanded secret redaction to cover `postgres://` and `postgresql://` connection strings and service tokens ([#97](https://github.com/jarredb9/finger-lakes-app-57/issues/97)).

## [0.2.0] - 2026-10-23

### Added
* Patch-based test authoring and surgical search/replace patch manifest application in Stage 2 Red phase ([ADR-0005](../../docs/adr/0005-autonomous-nightly-agent-workflow.md)).
* Target test file deduplication and component stem grouping to cap blast-radius regression suites ([ADR-0005](../../docs/adr/0005-autonomous-nightly-agent-workflow.md)).
* Targeted ESLint verification gate in Stage 3 Green phase with retry feedback loop.

### Changed
* Gated Edge Function modifications from headless agent execution, terminating early with maintainer advisories.
* Pruned prompt context: isolated repository file tree retrieval to Stage 1 Planner and optimized prompts with static prefix caching.
* Pruned diagnostic stack traces and normalized blank lines to enforce a 4,000-character context ceiling ([ADR-0005](../../docs/adr/0005-autonomous-nightly-agent-workflow.md)).

### Fixed
* Prohibited nested ternaries (>1 level) across core utilities and components.

## [0.1.1] - 2026-10-21

### Added
* Fallback environment variables (`DEFAULT_SUPABASE_TEST_ENV`) for Supabase test sandboxes ([ADR-0005](../../docs/adr/0005-autonomous-nightly-agent-workflow.md)).
* Authoritative maintainer `## Agent Brief` specification parsing from issue comments.

### Changed
* Enforced clean working tree resets before each Stage 3 attempt to prevent dirty state accumulation.
* Merged stdout and stderr in test verification to prevent diagnostic unmasking.
* Purged checkpoint files (`.agent-state.json`, `AGENT_HANDOFF.md`) from git index before staging target sources.

### Security
* Enforced strict patch target whitelisting and path normalization to prevent unauthorized file modifications.

## [0.1.0] - 2026-10-19

### Added
* Initial modular Python package architecture for `agent-resolve` with PEP 621 packaging metadata ([ADR-0005](../../docs/adr/0005-autonomous-nightly-agent-workflow.md)).
* 4-stage autonomous TDD resolution pipeline (`diagnose`, `plan`, `red`, `green`).
* Blast-radius test isolation and ancestor proximity ranking to cap regression suites without bloating prompt tokens ([#77](https://github.com/jarredb9/finger-lakes-app-57/issues/77), [ADR-0005](../../docs/adr/0005-autonomous-nightly-agent-workflow.md)).
* Fail-fast TypeScript compilation check and error output truncation before running Jest.
* Discounted cached token budgeting (25% weight on cached prompt tokens) with pre-call budget guards.
* Two-tier fuzzy patch engine with transactional rollback.
* Read-only diagnostic exploration tools (`grep_search`, `find_files`, `read_file_snippet`).
* Executable backward-compatible CLI shim for `scripts/agent-resolve/agent-resolve.py`.

### Security
* Container-isolated test runner execution with `--network none` and matching host UID/GID.
* Secret scrubbing (`sanitize_secrets`) redacting API keys, GitHub tokens, and Bearer headers from logs and error contexts.
* Protected path blocking preventing modifications to database migrations, `.git/`, workflows, and agent scripts.

[Unreleased]: https://github.com/jarredb9/finger-lakes-app-57/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/jarredb9/finger-lakes-app-57/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/jarredb9/finger-lakes-app-57/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/jarredb9/finger-lakes-app-57/releases/tag/v0.1.0
