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
- **Business Logic:** Supabase Native Architecture (Postgres RPCs and direct client SDK calls)
- **Maps:** Google Maps Platform (@vis.gl/react-google-maps)
- **Storage:** Supabase Storage (for visit photos)

## Tooling & Infrastructure
- **Language:** TypeScript
- **Testing (Unit):** Jest + React Testing Library
- **Testing (E2E):** Playwright (cross-browser coverage)
- **Migrations:** Supabase Migration-First workflow
- **PWA:** @serwist/next for offline support and service workers
