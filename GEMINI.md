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
- **Conductor Lifecycle:** Write Failing Test -> Implement -> Pass Test -> Commit -> Update plan.md. Execute ONE task at a time.
- **Context Efficiency (MANDATORY):** 
    - **Directive Override:** This protocol applies to ALL tasks, including Conductor tracks and formal "System Directives." A large directive does NOT excuse history bloat.
    - **Hard Delegation Threshold:** Any research, audit, or "Discovery Phase" (finding violations/files) MUST be delegated to a sub-agent if it exceeds 2 tool calls in the main session.
    - **Batch Task Mandate:** Implementing a task that touches more than 2 files MUST start with a sub-agent audit to "compress" the required context.
    - **Zero-Leakage Summarization:** NEVER copy-paste large blocks of code or verbose logs from sub-agents into the main session history. You MUST "digest" sub-agent findings into a high-signal, bulleted summary that contains ONLY architectural insights, required changes, and critical constants.
    - **High-Volume Output Mandate:** Commands expected to generate >100 lines of output (e.g., containerized E2E tests, verbose builds, exhaustive audits) MUST be delegated to a sub-agent. The sub-agent will run the command and provide a "Zero-Leakage Summary" of the results (pass/fail status, critical errors, and line numbers).
    - **Surgical Read Mandate:** Never read more than 50 lines at once. Use line ranges.
- **Verification Rule:** Always favor empirical evidence (running tests) over assumptions.
- **Microscope Rule:** Use Podman for SDL-MCP (see `AGENT.md` for command).
- **Python Version:** **MANDATORY:** Use `python3.11` for all scripts and skills.
- **Local DB Stack:** Start with `export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock && npx supabase start`.
- **Playwright Container:** **MANDATORY:** Local testing MUST use rootless Podman via `./scripts/run-e2e-container.sh`. DO NOT run `npx playwright test` directly on the host. Use the --build option after updating the application to ensure a fresh build. Example `./scripts/run-e2e-container.sh --build chromium e2e/smoke.spec.ts`
