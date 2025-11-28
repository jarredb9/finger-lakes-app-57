# Fingerlakes Winery Visit Planner and Tracker

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/jarreds-projects-8ff50eea/v0-fingerlakes-winery-app)
[![Built with v0](https://img.shields.io/badge/Built%20with-v0.dev-black?style=for-the-badge)](https://v0.dev/chat/projects/Zculw1N8IrK)

## Overview

This is a Next.js web application for planning and tracking visits to wineries in the Finger Lakes region. It allows users to explore wineries, create trips, track visits, and manage friends. The project is automatically synced with v0.dev deployments.

**Live URL:** [https://vercel.com/jarreds-projects-8ff50eea/v0-fingerlakes-winery-app](https://vercel.com/jarreds-projects-8ff50eea/v0-fingerlakes-winery-app)

## Tech Stack

*   **Framework:** Next.js 14 (App Router)
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS, Radix UI (via shadcn/ui)
*   **State Management:** Zustand
*   **Database/Auth:** Supabase
*   **Maps:** Google Maps Platform
*   **Forms:** React Hook Form + Zod
*   **Testing:** Jest + React Testing Library

## Key Commands

*   **Development Server:** `npm run dev`
*   **Build:** `npm run build`
*   **Lint:** `npm run lint`
*   **Type Check:** `npm run type-check`
*   **Test:** `npm run test`

> **Note:** If you are running this in a Codespace or environment with NVM, ensure you load NVM before running commands:
> ```bash
> export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
> ```

## Database Management (Supabase)

We use a strict **Migration-First** workflow. The `supabase/migrations` folder is the source of truth.

1.  **Create Migration:** `npx supabase migration new <description_of_change>`
2.  **Edit SQL:** Write your changes in the generated file in `supabase/migrations/`.
3.  **Deploy:** `npx supabase db push`

**Do not** manually edit the database via the Supabase dashboard or edit old schema files.

## Project Structure

*   `app/`: Next.js App Router pages and API routes.
*   `components/`: React components (UI library and feature-specific).
*   `lib/`: Core logic, including Zustand stores (`lib/stores`) and types (`lib/types.ts`).
*   `supabase/`: Database configuration and migrations.
*   `public/`: Static assets.

## Development Conventions

*   **Imports:** Use absolute imports (e.g., `@/components/...`).
*   **State:** Use Zustand for global state management.
*   **Styling:** Use Tailwind utility classes.
*   **Icons:** Use Lucide React icons.

## How It Works (v0.dev Sync)

1.  Create and modify your project using [v0.dev](https://v0.dev/chat/projects/Zculw1N8IrK).
2.  Deploy your chats from the v0 interface.
3.  Changes are automatically pushed to this repository.
4.  Vercel deploys the latest version from this repository.
