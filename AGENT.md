# Project: Winery Visit Planner and Tracker (AGENT.md)

## 1. Core Tech Stack
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript.
- **Styling:** Tailwind CSS v4, shadcn/ui.
- **State:** Zustand.
- **Backend:** Supabase (Postgres, Auth, Edge Functions, Realtime).
- **Testing:** Playwright (E2E), Jest (Unit).

## 2. Environment & Shell (RHEL 8)
- **Dev Server:** `npm run dev` (http://localhost:3000).
- **Python:** **MANDATORY:** Use `python3.11`.
- **Local Database:** http://127.0.0.1:54321.
    - Start: `export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock && npx supabase start`
- **Playwright:** MUST use Podman: `./scripts/run-e2e-container.sh [project] [test_file]`. Use `--build` if logic changed.

## 3. Project Structure
```
/
├── app/                 # Routes: api/, login/, trips/, friends/, settings/, ~offline/
├── components/          # UI Components: ui/ (shadcn), map/, [feature].tsx
├── e2e/                 # Playwright Tests: flows, helpers.ts
├── lib/                 # Core Logic: stores/, services/, utils/, database.types.ts
└── supabase/            # Backend: migrations/, functions/
```

## 4. Reference Implementations
- **Data Standard:** `lib/utils/winery.ts` (`standardizeWineryData`)
- **RPC Service:** `lib/services/tripService.ts`
- **Complex UI/DnD:** `components/trip-card.tsx`
- **Offline Store:** `lib/stores/visitStore.ts`
- **E2E Spec:** `e2e/trip-flow.spec.ts`

## 5. Code Intelligence Tools
- **Radar (CGC):** `cgc mcp start`.
- **Microscope (SDL-MCP):** Run via Podman (see `GEMINI.md` for command).
