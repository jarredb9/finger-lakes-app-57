# 🚨 MAINTENANCE PROTOCOL (MANDATORY)
*   **No History:** NEVER log "Completed Refactors" or "Bug Fixes." Update the relevant "Standard" instead.
*   **Standards > Pitfalls:** Add discovery-based rules as positive requirements in AGENT.md or specialized Skills.
*   **Ephemeral Only:** Only add "Pitfalls" for transient environment bugs. Delete once stabilized.
*   **Conductor for Status:** Do NOT add project progress here. Use Conductor.

# 🚨 MANDATORY SKILL ROUTER (PRIORITY 0)
BEFORE performing any action, implementation, or deep analysis, you MUST:
1. Scan the `available_skills` list (pwa-stability, architecture-standards, project-testing-best-practices).
2. If the current task involves these domains, you MUST call `activate_skill(name="...")` to load both operational constraints and technical rules.
3. DO NOT proceed until the specialized instructions are loaded.

# 🚨 SYSTEM OVERRIDE INSTRUCTIONS (PRIORITY 1)

### 1. Mandatory Global Skills & Discovery
*   **Discovery:** You MUST read `AGENTS.md` and `conductor/index.md` at the start of every session.
*   **Analysis:** `codebase-analysis`, `problem-analysis` for investigation.
*   **Verification:** `project-testing-best-practices` MUST be active BEFORE writing any tests.
*   **Handoff:** `handoff-protocol` MUST be active AFTER completing feature logic.

### 2. Operational Override
- **Delegation Protocol (MANDATORY):** When invoking a sub-agent, the Orchestrator MUST prepend the following **Efficiency Directive** to the sub-agent's prompt:

```text
### 🚨 MANDATORY OPERATIONAL CONSTRAINTS (PRIORITY 0) 🚨
1. **Parallel Discovery:** You MUST use parallel tool calls for file reads/searches.
2. **Verification Sandbox:** You are permitted to use `write_file` ONLY for creating temporary files (e.g., `temp_fix.ts` or `e2e/tmp_repro.spec.ts`) to verify hypotheses. You are FORBIDDEN from modifying existing source files.
3. **Turn 10 Checkpoint:** If you reach Turn 10 without a final proposal, you MUST save your current findings and technical debt to a temporary markdown file, return the file path, and halt.
4. **Build Limit:** Never use the `--build` flag if a build has already occurred in the parent session.
5. **Zero-Waste Grep:** Use `grep_search` with narrow scopes and `context`/`before`/`after` parameters to eliminate redundant `read_file` calls. Avoid `ReadFolder` on core directories.
6. **Acknowledge:** Your first turn MUST state: "I have read and will obey the Efficiency Directive."

### 🚨 SUB-AGENT CONTEXT GUARD (MANDATORY) 🚨
To prevent sub-agent instructional drift and history bloat:
1. **Surgical Read Limit:** Sub-agents MUST NOT read more than 50 lines of code at once. Use `start_line` and `end_line`.
2. **Aggressive Parallelism:** Sub-agents MUST combine all independent discovery tasks (glob, grep, read) into a single turn. Sequential discovery is FORBIDDEN.
3. **Turn 5 Diagnostic Pivot:** If you reach Turn 5 of an investigation without identifying a root cause, you MUST stop and evaluate your progress. If you are "guessing" or aimlessly searching, you MUST halt and report "Inconclusive Findings" rather than pushing to Turn 10.
4. **Zero-Leakage Handoff:** Sub-agents MUST NOT return verbose logs, error traces, or large code blocks to the Orchestrator. They MUST return a **High-Signal Summary** containing only:
    - Root cause/Technical finding.
    - Proposed diff (Propose-Only).
    - Verification status (from the Sandbox).
```

- **Conductor Lifecycle:** Write Failing Test -> Implement -> Pass Test -> Commit -> Update plan.md. Execute ONE task at a time.
- **Context Efficiency (MANDATORY):** 
    - **Directive Override:** This protocol applies to ALL tasks, including Conductor tracks.
    - **Delegated Discovery & Verification:** Any research/audit/investigation (>2 calls) OR high-volume output (>100 lines, e.g., tests/builds) MUST be delegated. **Investigation IS Discovery:** If a test fails, you MUST delegate the root-cause analysis (reading multiple files/grep) to a sub-agent. **FORBIDDEN:** NEVER run `./scripts/run-e2e-container.sh` in the main session history.
    - **Turn 5 Context Audit:** At Turn 5 of any session, the agent MUST evaluate its context usage. If it has not delegated research/audits yet, it MUST halt and delegate immediately to prevent history bloat.
    - **Orchestrator-Led Implementation:** For surgical fixes (<3 files), the Orchestrator MUST apply the code changes using `replace` or `write_file` in the main session based on sub-agent proposals. This ensures code review visibility.
    - **Delegated Batch Implementation:** ONLY tasks touching >=3 files or repetitive "grunt work" may be fully implemented by a sub-agent. In these cases, the Orchestrator MUST review the `git diff` before committing.
    - **Zero-Leakage Summarization:** NEVER copy-paste large blocks of code from sub-agents. Digest findings into architectural insights, required changes, and critical constants.
    - **Sub-agent Operational Standards (RECURSIVE):** 
        - **Sandboxed Verification:** Sub-agents MUST verify hypotheses in temporary files but are **FORBIDDEN** from using `replace` or `write_file` on source code. They MUST return a "Propose-Only" diff.
        - **Parallel Discovery:** Sub-agents MUST use parallel tool calls to read related files to minimize context-heavy turns.
        - **Test Run Limit:** A sub-agent MUST NOT run `./scripts/run-e2e-container.sh` more than twice.
        - **Surgical Investigation:** Sub-agents must prioritize `grep_search` with context parameters over full file reads.
- **Verification Rule:** Always favor empirical evidence (running tests) over assumptions.
- **Microscope Rule:** Use Podman for SDL-MCP (see `AGENT.md` for command).
- **Python Version:** **MANDATORY:** Use `python3.11` for all scripts and skills.
- **Local DB Stack:** Start with `export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock && npx supabase start`.
- **Playwright Container:** **MANDATORY:** Local testing MUST use rootless Podman via `./scripts/run-e2e-container.sh`. DO NOT run `npx playwright test` directly on the host. Use the --build option after updating the application to ensure a fresh build. Example `./scripts/run-e2e-container.sh --build chromium e2e/smoke.spec.ts`
