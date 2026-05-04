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
    - **Directive Override:** This protocol applies to ALL tasks, including Conductor tracks.
    - **Delegated Discovery & Verification:** Any research/audit (>2 calls) OR high-volume output (>100 lines, e.g., tests/builds) MUST be delegated. The sub-agent must return a "Zero-Leakage Summary" with proposals, NOT implement them. **FORBIDDEN:** NEVER run `./scripts/run-e2e-container.sh` in the main session history.
    - **Turn 5 Context Audit:** At Turn 5 of any session, the agent MUST evaluate its context usage. If it has not delegated research/audits yet, it MUST halt and delegate immediately to prevent history bloat.
    - **Orchestrator-Led Implementation:** For surgical fixes (<3 files), the Orchestrator MUST apply the code changes using `replace` or `write_file` in the main session based on sub-agent proposals. This ensures code review visibility.
    - **Delegated Batch Implementation:** ONLY tasks touching >=3 files or repetitive "grunt work" may be fully implemented by a sub-agent. In these cases, the Orchestrator MUST review the `git diff` before committing.
    - **Zero-Leakage Summarization:** NEVER copy-paste large blocks of code from sub-agents. Digest findings into architectural insights, required changes, and critical constants.
- **Verification Rule:** Always favor empirical evidence (running tests) over assumptions.
- **Microscope Rule:** Use Podman for SDL-MCP (see `AGENT.md` for command).
- **Python Version:** **MANDATORY:** Use `python3.11` for all scripts and skills.
- **Local DB Stack:** Start with `export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock && npx supabase start`.
- **Playwright Container:** **MANDATORY:** Local testing MUST use rootless Podman via `./scripts/run-e2e-container.sh`. DO NOT run `npx playwright test` directly on the host. Use the --build option after updating the application to ensure a fresh build. Example `./scripts/run-e2e-container.sh --build chromium e2e/smoke.spec.ts`
