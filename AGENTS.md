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
- **Python:** **MANDATORY:** Use `python3.11`.
- **Local Database:** http://127.0.0.1:54321.
    - Start: `export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock && npx supabase start`
- **Playwright:** MUST use Podman: `./scripts/run-e2e-container.sh [project] [test_file]`. Use `--build` if logic changed.

## 4. Coding Standards & Truths
- **Middleware:** `proxy.ts` IS the valid middleware. `middleware.ts` DOES NOT exist.
- **Date Handling:** ALWAYS use `formatDateLocal(date)` and `getTodayLocal()` from `lib/utils.ts`.
- **ID Normalization:** Zustand stores MUST normalize relational IDs to `Number()` upon retrieval.
- **UI Pattern:** Use **Container/Presentational** pattern. UI components are "Presentational".
- **Styling:** Use **Tailwind CSS v4**. Avoid custom CSS.
- **DOM Stability:** Critical UI containers (e.g., `map-container`, `trip-list-container`) MUST remain in the DOM during error/loading states. Use `data-state="error|loading|ready"` and render `Alert` or `Loader` components *inside* the container instead of early returns.
- **Error Propagation:** Hooks managing major views (e.g., `useWineryMap`) MUST combine errors from all relevant stores (Map, WineryData, Trips) to ensure global load failures are visible in the primary viewport.

## 5. Workflows & Verification
- **Protocol:** Follow the **Conductor Lifecycle** and **Context Efficiency Mandate** defined in `GEMINI.md`.
- **Testing:** Favor empirical evidence (running tests) over assumptions.
- **Atomic Verification:** A task is NOT complete until its specific E2E test passes.
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

## 9. Code Intelligence Tools
- **Radar (CGC):** `cgc mcp start`.
- **Microscope (SDL-MCP):** Run via Podman (see Section 5).
