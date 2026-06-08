# Technology Stack

## Frontend
- **Framework:** Next.js 16 (App Router)
- **Library:** React 19
- **State Management:** Zustand (for global UI and data caching)
- **Styling:** Tailwind CSS (v4) with CSS-native configuration
- **Components:** Radix UI primitives (via shadcn/ui)

## Backend & Services
- **Database:** PostgreSQL (managed by Supabase)
- **Authentication:** Supabase Auth (Native SDK on client)
- **Business Logic:** Hybrid Supabase Architecture (Edge Functions for external API orchestration and Gemini AI integration; Postgres RPCs for atomic high-volume operations)
- **Maps:** Google Maps Platform (Places API v1 via @vis.gl/react-google-maps)
- **Storage:** Supabase Storage (for visit photos)

## Tooling & Infrastructure
- **Language:** TypeScript (including Deno for backend Edge Function logic)
- **Testing (Unit):** Jest + React Testing Library (Frontend); Deno Testing (Backend)
- **Testing (E2E):** Playwright (cross-browser coverage with stable `data-state` verification)
- **Migrations:** Supabase Migration-First workflow with automated CI structural auditing (`db diff --linked`)
- **Middleware:** `proxy.ts` (Next.js 16 pattern) for request-time logic and session management
- **PWA:** @serwist/next for offline support and service workers
- **Offline Storage:** idb-keyval with Web Crypto API (AES-GCM) for secure mutation queuing; Base64 photo persistence for cross-browser reliability
