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
*   **Production Guardrail:** You are FORBIDDEN from applying migrations (`mcp_supabase_apply_migration`) or executing mutations (`mcp_supabase_execute_sql` with DDL or DML statements like INSERT/UPDATE/DELETE) on the production project ID (`jfsxclrdxmvftxacjuqf`) unless the user explicitly requests it AND you have obtained a secondary "Yes, I am sure" confirmation in a separate turn. **IF IN DOUBT, USE THE LOCAL CLI (`npm run db:query`).**
*   **Discovery:** You MUST read `AGENTS.md` and `conductor/index.md` at the start of every session.
*   **Analysis:** `codebase-analysis`, `problem-analysis` for investigation.
*   **Verification:** `project-testing-best-practices` MUST be active BEFORE writing any tests.
*   **Handoff:** `handoff-protocol` MUST be active AFTER completing feature logic.
*   **Pre-Flight Protocol Verification (MANDATORY - Orchestrator):** In your FIRST turn of EVERY session, the **Orchestrator** MUST include a "Protocol Verification" block in your `update_topic` call (or as a brief text preamble) that explicitly confirms:
    1. "I will delegate all investigations and batch E2E test runs to a sub-agent."
    2. "I am permitted to run surgical E2E verifications (single files) in the main session when implementation context is critical."
    3. "I have scanned for relevant skills and will activate them before implementation."
    4. "I will NOT execute mutations on production project `jfsxclrdxmvftxacjuqf` without secondary confirmation."

### 2. Delegation & Context Mandate (MANDATORY - Orchestrator)
- **Hard Thresholds:** The Orchestrator MUST delegate any investigation (>2 calls), complex failure analysis, or high-volume output task (>100 lines).
- **Surgical Exception:** You MAY run `./scripts/run-e2e-container.sh` in the main session ONLY for verifying a single test file directly related to your current implementation.
- **Orchestrator Role:** When invoking a sub-agent, you MUST:
    1. Prepend the **Efficiency Directive** (from `AGENTS.md`) to the prompt.
    2. If the task is part of a Conductor Track, include the `plan.md` and `spec.md` of that track.
- **Strategic Recovery:** If a sub-agent reports "Strategy Exhausted" or "Inconclusive Findings," the Orchestrator MUST pivot the plan and provide a new, distinct strategy to the next sub-agent. DO NOT simply retry the same request.
- **Zero-Leakage Summarization:** You MUST extract the **Diagnostic Signal** ([BLOCKER], [HYPOTHESIS], [ACTION]) from sub-agent outputs and present only the architectural synthesis to the user.

### 3. Common Sub-agent Pitfalls (Shared Memory)
- **CLI Syntax:** Delegates often place flags (like `--build`) after the project name. Flags MUST come first.
- **Project Confusion:** Delegates confuse folders (e.g., `visits`) with Playwright projects (`chromium`, `webkit`).
- **Data Isolation:** Delegates forget that the container uses its own `.env` and database stack.
- **Diagnostic Shallowing:** Delegates often report "Element not visible" without checking the underlying Zustand store or network requests.

### 4. Execution Standard
- **Execution Split:** Orchestrator handles surgical fixes (<3 files); sub-agents handle batch work (>=3 files).
- **Conductor:** Execute ONE task at a time. Write Test -> Implement -> Pass -> Commit.
