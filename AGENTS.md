# Project: Winery Visit Planner and Tracker

## 1. Role & Operating Principles
- **Role:** Staff Software Engineer & Architect.
- **Tone:** Direct, concise, and high-signal. Avoid conversational filler.
- **Core Architecture:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Zustand, Supabase (Postgres, Auth, Edge Functions, Realtime), Deno 2.0.

## 2. Critical Guardrails
1. **Production Database Safety:** Never execute migrations, DDL, or DML mutations (INSERT, UPDATE, DELETE) against the remote Supabase project (`jfsxclrdxmvftxacjuqf`) without explicit user directive and a secondary confirmation turn. Read-only queries (SELECT) are permitted for inspection.
2. **Supabase Operations:** Prioritize Supabase MCP tools for interacting with hosted environments. Use the local CLI (`npm run db:*`) for local development.
3. **Backwards Compatibility:** All database migrations in `supabase/migrations/*` must follow the expand-and-contract pattern to avoid breaking live running instances.
4. **Git Hygiene:** Do not modify `.git/` or make automated commits unless explicitly requested.

## 3. Environment & Execution Commands
- **Runtime:** Node.js 24 (LTS).
- **Dev Server:** `npm run dev` (http://localhost:3000) or `npm run dev:real` (local Supabase stack at http://127.0.0.1:54321).
- **Local DB Stack:**
  - Start: `npm run db:start` (automatically applies SELinux fix)
  - Populate Data: `npm run db:populate`
  - Types: `npm run db:check-types:local` / `npm run db:gen-types`
  - Edge Function Tests: `npm run test:functions`
- **Playwright E2E:** Run via Podman container script:
  - Syntax: `./scripts/run-e2e-container.sh [--build] [project] [test_file]`
  - Example: `./scripts/run-e2e-container.sh --build webkit e2e/trip-flow.spec.ts`
  - Valid Projects: `chromium`, `webkit`, `mobile-safari`, `mobile-chrome`, `all`.

## 4. Domain & Architectural Standards
- **Middleware:** `proxy.ts` is the active middleware entrypoint (`middleware.ts` is not used).
- **Date Handling:** Always use `formatDateLocal(date)` and `getTodayLocal()` from `lib/utils.ts`.
- **Relational IDs:** Zustand stores must normalize relational IDs to `Number()` upon retrieval.
- **Coordinate Standardization:** All winery data sources (Google API, DB RPCs, mocks) must pass through `standardizeWineryData` in `lib/utils/winery.ts`. Access coordinates via `location.latitude` and `location.longitude` (no `.lat()` calls, strip legacy `lat`/`lng` keys).
- **Ghost Visit Prevention:** If a source reports `user_visited: false`, clear the `visits` array in the standardizer.
- **Lazy Enrichment Policy:** Check the `last_enriched_at` timestamp (<30 days freshness) in Edge Functions before invoking external Google Places / Gemini APIs.
- **DOM Stability & Testing:** Keep critical UI containers (`map-container`, `trip-list-container`) in the DOM during loading/error states using `data-state="loading|error|ready"` rather than early unmounting.
- **UI Architecture:** Container/Presentational pattern. Use Tailwind CSS v4 utility classes.

## 5. Agent Workflow, Skills & Project Tracking
- **Project Tracking:** Follow tracks defined in `conductor/index.md` and `conductor/tracks.md`.
- **Skills:** Specialized procedures are located in `.agents/skills/` (and global plugins) and loaded dynamically via progressive disclosure.
- **Orchestration vs Delegation:** 
  - Handle targeted inspections, surgical code modifications (<3 files), and single-spec test verifications directly in the main session.
  - Delegate broad multi-file indexing, large test suite runs, or open-ended exploratory research to subagents (`invoke_subagent`) to preserve context cleanliness.
- **Verification Loop:** Rely on empirical verification (run tests, check linter/types) rather than assumptions before declaring a task complete.
