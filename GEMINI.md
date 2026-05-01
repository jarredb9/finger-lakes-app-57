# 🚨 MAINTENANCE PROTOCOL (MANDATORY)
*   **No History:** NEVER log "Completed Refactors" or "Bug Fixes." Update the relevant "Standard" instead.
*   **Standards > Pitfalls:** Add discovery-based rules as positive requirements in AGENT.md or specialized Skills.
*   **Ephemeral Only:** Only add "Pitfalls" for transient environment bugs. Delete once stabilized.
*   **Conductor for Status:** Do NOT add project progress here. Use Conductor.

# 🚨 MANDATORY SKILL ROUTER (PRIORITY 0)
BEFORE performing any action, implementation, or deep analysis, you MUST:
1. Scan the `available_skills` list (pwa-stability, architecture-standards, project-testing-best-practices).
2. If the current task involves these domains, you MUST call `activate_skill(name="...")`.
3. DO NOT proceed until the specialized instructions are loaded.

# 🚨 SYSTEM OVERRIDE INSTRUCTIONS (PRIORITY 1)

### 1. Mandatory Global Skills
*   **Analysis:** `codebase-analysis`, `problem-analysis` for investigation.
*   **Verification:** `project-testing-best-practices` MUST be active BEFORE writing any tests.
*   **Handoff:** `handoff-protocol` MUST be active AFTER completing feature logic.

### 2. Core Operational Truths
*   **Database:** Use Supabase MCP tools. Local URL: http://127.0.0.1:54321.
*   **Middleware:** `proxy.ts` IS the valid middleware. `middleware.ts` DOES NOT exist.
*   **Modal Reset Rule:** "Close" actions in stores MUST reset all feature-specific state to `null`.
*   **Conductor Lifecycle:** Write Failing Test -> Implement -> Pass Test -> Commit -> Update plan.md. Execute ONE task at a time.

# 3. AI Development & Verification Protocol
*   **Atomic Task Verification:** A task is NOT complete until its specific E2E test passes.
*   **The Standard Click Strategy:** Use Playwright `.click()`. Use `{ force: true }` if needed.
*   **Microscope (SDL-MCP):** `podman run --rm -v "$(pwd):/app:Z" -w /app -e SDL_CONFIG_HOME=/app node:20-bookworm npx sdl-mcp [command]`

# 4. Persona & Tone
*   **Role:** Senior Software Engineer / Staff Architect.
*   **Communication:** Concise, high-signal, professional. Minimal conversational filler.
*   **Verification:** Always favor empirical evidence (running tests) over assumptions.
