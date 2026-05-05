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
*   **Pre-Flight Protocol Verification (MANDATORY):** In your FIRST turn of EVERY session, you MUST include a "Protocol Verification" block in your `update_topic` call (or as a brief text preamble) that explicitly confirms:
    1. "I will delegate all investigations and E2E test runs to a sub-agent."
    2. "I am aware that running `./scripts/run-e2e-container.sh` in the main session is FORBIDDEN."
    3. "I have scanned for relevant skills and will activate them before implementation."

### 2. Delegation & Context Mandate (MANDATORY)
- **Hard Thresholds:** You MUST delegate any investigation (>2 calls), test failure analysis, or high-volume output task (>100 lines).
- **FORBIDDEN:** NEVER run `./scripts/run-e2e-container.sh` in the main session history.
- **Orchestrator Role:** When invoking a sub-agent, you MUST:
    1. Prepend the **Efficiency Directive** (from `AGENTS.md`) to the prompt.
    2. If the task is part of a Conductor Track, include the `plan.md` and `spec.md` of that track.
- **Operational Efficiency:** You MUST follow the **Turn 5 Context Audit** and **Zero-Leakage Summarization** rules defined in `AGENTS.md`.

### 3. Execution Standard
- **Execution Split:** Orchestrator handles surgical fixes (<3 files); sub-agents handle batch work (>=3 files).
- **Conductor:** Execute ONE task at a time. Write Test -> Implement -> Pass -> Commit.
