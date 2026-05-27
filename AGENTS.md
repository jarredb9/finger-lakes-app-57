<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.

<!-- END:nextjs-agent-rules -->

# Project: Winery Visit Planner and Tracker (AGENTS.md)

## 1. Persona & Role
- **Role:** Senior Software Engineer / Staff Architect.
- **Tone:** Professional, direct, and concise. High-signal output only.
- **Expertise:** Next.js 16, Supabase, PWA resilience, and Atomic Verification.

## 2. Core Tech Stack
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript.
- **Styling:** Tailwind CSS v4, shadcn/ui.
- **State:** Zustand.
- **Backend:** Supabase (Postgres, Auth, Edge Functions, Realtime).
- **Testing:** Playwright (E2E), Jest (Unit).

## 3. Environment & Shell (RHEL 8)
- **Dev Server:** `npm run dev` (http://localhost:3000).
- **Python:** **MANDATORY:** Use `python3.11` for all scripts and skills.
- **Local Database:** http://127.0.0.1:54321.
    - Start: `npm run db:start`
    - Stop: `npm run db:stop`
    - Status: `npm run db:status`
    - Check Types: `npm run db:check-types:local`
    - Update Types: `npm run db:gen-types`
- **Playwright:** MUST use Podman: `./scripts/run-e2e-container.sh [project] [test_file]`. Use `--build` if logic changed. **Note:** Orchestrator may run surgical tests (single file) directly in main session.
- **Microscope (SDL-MCP):** `podman run --rm -v "$(pwd):/app:Z" -w /app -e SDL_CONFIG_HOME=/app node:20-bookworm npx sdl-mcp [command]`

## 4. Coding Standards & Truths
- **Middleware:** `proxy.ts` IS the valid middleware. `middleware.ts` DOES NOT exist.
- **Date Handling:** ALWAYS use `formatDateLocal(date)` and `getTodayLocal()` from `lib/utils.ts`.
- **ID Normalization:** Zustand stores MUST normalize relational IDs to `Number()` upon retrieval.
- **RPC Return Types:** Ensure that `RETURNS TABLE` types in Postgres functions match the actual data types of the returned columns (e.g., use `text` for `google_place_id` to match the `wineries` table) to avoid type mismatch errors (42804).
- **Coordinate Standardization:** All winery data sources (Google API, DB RPCs, Mocks) MUST be passed through `standardizeWineryData` in `lib/utils/winery.ts` to ensure consistent mapping of IDs (`googleId`, `dbId`) and coordinates (`latitude`, `longitude`).
- **Ghost Visit Prevention:** When processing winery data, if the source explicitly reports `user_visited` as `false`, the `visits` array MUST be explicitly cleared in the standardizer to prevent stale local cache data.
- **UI Pattern:** Use **Container/Presentational** pattern. UI components are "Presentational".
- **Styling:** Use **Tailwind CSS v4**. Avoid custom CSS.
- **DOM Stability:** Critical UI containers (e.g., `map-container`, `trip-list-container`) MUST remain in the DOM during error/loading states. Use `data-state="error|loading|ready"` and render `Alert` or `Loader` components *inside* the container instead of early returns.
- **Error Propagation:** Hooks managing major views (e.g., `useWineryMap`) MUST combine errors from all relevant stores (Map, WineryData, Trips) to ensure global load failures are visible in the primary viewport.
- **Backwards-Compatible Schema Changes**: All database migrations (`supabase/migrations/*`) MUST be strictly backwards-compatible (using the expand-and-contract pattern) so that the currently running app does not crash when migrations are pushed prior to code build completion.

## 5. Workflows & Verification
- **Protocol:** Follow the **Conductor Lifecycle**, **Context Efficiency Mandate**, and **Pre-Flight Protocol Verification** defined in `GEMINI.md`.
- **Supabase Squash:** If remote migrations are missing locally, refer to [SUPABASE_SQUASH.md](./docs/architecture/SUPABASE_SQUASH.md).
- **Pre-Flight Mandate:** You MUST explicitly acknowledge the delegation requirement for batch E2E tests and investigations in your first turn.
- **Testing:** Favor empirical evidence (running tests) over assumptions.
- **Atomic Verification:** A task is NOT complete until its E2E test passes. **PRIORITIZE** bypassing navigation via `page.evaluate` store state injection to keep tests under 15s.
- **Standard Click:** Use Playwright's native `.click()`. Use `{ force: true }` if needed.
- **Microscope (SDL-MCP):** `podman run --rm -v "$(pwd):/app:Z" -w /app -e SDL_CONFIG_HOME=/app node:20-bookworm npx sdl-mcp [command]`

## 6. Project Structure
```
/
├── app/                 # Routes: api/, login/, trips/, friends/, settings/, ~offline/
├── components/          # UI Components: ui/ (shadcn), map/, [feature].tsx
├── e2e/                 # Playwright Tests: flows, helpers.ts
├── lib/                 # Core Logic: stores/, services/, utils/, database.types.ts
└── supabase/            # Backend: migrations/, functions/
```

## 7. Reference Implementations
- **Data Standard:** `lib/utils/winery.ts` (`standardizeWineryData`)
- **RPC Service:** `lib/services/tripService.ts`
- **Complex UI/DnD:** `components/trip-card.tsx`
- **Offline Store:** `lib/stores/visitStore.ts`
- **E2E Spec:** `e2e/trip-flow.spec.ts`

## 8. Boundaries & Constraints
- **NEVER** modify `.git`, `.github`, or `.next` directories.
- **NEVER** log/print secrets or API keys.
- **NEVER** commit unless explicitly requested by the user.
- **NEVER** use `robustClick` or manual event dispatching in tests.

## 9. Operational & Context Efficiency

### Agent Session Taxonomy
- **Orchestrator (Main Session):** The primary agent. Goal: Probabilistic state management. It MUST delegate heavy tasks and manage the "Global Plan."
- **Delegate (Sub-Agent):** The execution environment. Goal: Task completion. It MUST be terminal (no further delegation).

### Rules for Orchestrators
- **Strategy Resets:** If a sub-agent reports the same failure twice, the Orchestrator MUST pivot to a different architectural approach rather than retrying.
- **Diagnostic Synthesis:** When a sub-agent fails, the Orchestrator MUST extract the semantic "root cause" before reporting to the user.
- **Pre-Flight Mandate:** You MUST explicitly acknowledge the delegation requirement for batch E2E tests and investigations in your first turn.

### Rules for Delegates
- **Authority:** You are the **authorized worker**. Run tests and heavy commands directly.
- **Terminality Mandate:** You are forbidden from using `invoke_agent`. If you cannot complete a task with available tools, report "Inconclusive Findings" with a Diagnostic Signal.
- **State Monotonicity:** If an error repeats, DO NOT retry the same fix. Stop and report the blocker.

### 🚨 Efficiency Directive (MANDATORY for Sub-Agents)
Prepend this block to all sub-agent prompts:
```text
### 🚨 MANDATORY OPERATIONAL CONSTRAINTS (PRIORITY 0) 🚨
1. **Identity:** You are the DELEGATE (Authorized Worker). You are the final execution environment.
2. **Terminality:** DO NOT invoke sub-agents. Complete the task or fail with a Diagnostic Signal.
3. **Parallel Discovery:** Use parallel tool calls. Minimize sequential reads.
4. **Verification Sandbox:** Use `write_file` ONLY for temporary files. DO NOT modify source unless explicitly asked for a refactor.
5. **Circuit Breaker:** If the same error occurs twice, STOP and report "Strategy Exhausted."
6. **Diagnostic Signal:** All failures MUST include: [BLOCKER], [HYPOTHESIS], and [REQUIRED_ORCHESTRATOR_ACTION]. Failures MUST also provide:
    - **Zustand Store Dump:** (via `page.evaluate(() => useStore.getState())`)
    - **Network Trace:** (Summary of failed RPCs/APIs from logs)
7. **CLI Cheat Sheet:** 
    - Correct: `./scripts/run-e2e-container.sh --build webkit e2e/my-test.spec.ts`
    - Incorrect: `./scripts/run-e2e-container.sh webkit e2e/my-test.spec.ts --build`
    - Valid Projects: `chromium`, `webkit`, `mobile-safari`, `mobile-chrome`.
8. **Build Policy:** Use `--build` ONLY if application files changed.
9. **Turn 5 Diagnostic Pivot:** If aimless at Turn 5, STOP and report "Inconclusive Findings."
10. **Acknowledge:** Your first turn MUST state: "I have read and will obey the Efficiency Directive as the terminal DELEGATE."
```

## 10. Code Intelligence Tools
- **Radar (CGC):** `cgc mcp start`.
- **Microscope (SDL-MCP):** Run via Podman (see Section 3).
