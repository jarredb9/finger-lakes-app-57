# Agent Tooling Changelog

All notable changes to the Conductor and agent helper scripts in `scripts/agent/` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
* Added `scripts/agent/conductor-auto.py` to execute multi-task Conductor track phases unattended via fresh `agy --print` turns with strict flag ordering, POSIX process group isolation, wall-clock turn timeouts, and `--dry-run` preview support ([#162](https://github.com/jarredb9/finger-lakes-app-57/issues/162)).
* Added a composable Gemini 4 Hydrogen model matrix (`DEFAULT_MODEL_FAMILY`, `ROLE_EFFORT_MAP`) with three-tier role resolution (per-role CLI flags, `CONDUCTOR_*_MODEL` environment variables, and `--model-family`) to keep automated runs in Pool A while preserving interactive Pool B quota ([#162](https://github.com/jarredb9/finger-lakes-app-57/issues/162)).
* Added post-execution supervisor verification enforcing working tree cleanliness (with optional `--auto-recover`), dual-check Red assertion failure validation, Green test and type-check gates, `[exempt: <category>]` checks, Conventional Commits, Git notes metadata, and `plan.md` completion tracking ([#162](https://github.com/jarredb9/finger-lakes-app-57/issues/162)).
* Added unattended phase boundary gates executing Gate 1 `--checkpoint --unattended` verification and Gate 2 `/conductor:review` with conversation ID snapshotting, `Critical`/`High` exit-code-2 remediation handoff, and `[exempt: docs]` Tier 1 and Gate 2 fast-path skipping ([#162](https://github.com/jarredb9/finger-lakes-app-57/issues/162)).
* Added live `--output-format stream-json` progress parsing, configurable `--heartbeat` status updates, timestamped runner banners and errors, and per-turn transcript logging under `conductor/tracks/<track>/logs/` ([#162](https://github.com/jarredb9/finger-lakes-app-57/issues/162)).
* Extended `scripts/agent/generate-prompt.py` with `[exempt: <category>]` annotation parsing, non-TDD verification strategy mapping, `--skip-plan` inline blueprint fallback, and `--unattended` checkpoint prompt generation ([#162](https://github.com/jarredb9/finger-lakes-app-57/issues/162)).
* Documented unattended track execution and phase structuring rules in `docs/agents/conductor-auto.md` and `conductor/workflow.md`, backed by unit tests in `scripts/__tests__/test_conductor_auto.py` and `scripts/__tests__/test_generate_prompt.py` ([#162](https://github.com/jarredb9/finger-lakes-app-57/issues/162)).
* Added `--review-only` mode to `scripts/agent/conductor-auto.py` to re-run Gate 2 reviews on checkpointed phases, alongside pre-flight working tree cleanliness checks, exact NDJSON conversation ID logging, and TypeScript style-guide guardrails in `scripts/agent/generate-prompt.py` ([#150](https://github.com/jarredb9/finger-lakes-app-57/issues/150), [#162](https://github.com/jarredb9/finger-lakes-app-57/issues/162)).

### Fixed
* Scoped phase checkpoint git diff ranges in `scripts/agent/generate-prompt.py` to each phase's resolved end commit SHA instead of `HEAD` to prevent subsequent commits from polluting historical phase domain classification ([#162](https://github.com/jarredb9/finger-lakes-app-57/issues/162)).
* Hardened `conductor-auto.py` and `generate-prompt.py` phase completion and `## Phase: Review Fixes` parsing, backticked SHA regexes, ancestor commit validation, Red-phase test filtering, Deno/error failure detection, headless `--plan`/`--recovery` prompts, and ephemeral review/log gitignore rules ([#150](https://github.com/jarredb9/finger-lakes-app-57/issues/150), [#162](https://github.com/jarredb9/finger-lakes-app-57/issues/162)).
* Fixed `scripts/agent/inspect-session.mjs` to extract the final UUID from nested brain paths, track `read_file`/`write_file`/`edit_file` with compact JSON-quoted arguments and `GENERIC` read correlation, report real token telemetry with character fallback, and compute multi-turn prompt histories and active durations ([#150](https://github.com/jarredb9/finger-lakes-app-57/issues/150), [#162](https://github.com/jarredb9/finger-lakes-app-57/issues/162)).

[Unreleased]: https://github.com/jarredb9/finger-lakes-app-57/commits/HEAD/scripts/agent
