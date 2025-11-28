# Fingerlakes Winery Visit Planner and Tracker

## Project Overview
This is a Next.js web application for planning and tracking visits to wineries in the Finger Lakes region. It allows users to explore wineries, create trips, track visits, and manage friends.

## Critical Instructions & Constraints

### 1. Environment & Shell
*   **Operating System:** Linux (Codespaces/Cloud Environment).
*   **Node Version Manager:** When running `npm` commands, you **must** load NVM first:
    ```bash
    export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    ```
*   **Deployment:** The application is deployed to a remote Vercel server. There is **no local installation** running on this specific shell instance (unless started via `npm run dev`).

### 2. Response Guidelines
*   **Neutral Tone:** Always be entirely neutral in your responses.
*   **Troubleshooting:** Do not guess at error solutions. Include `console.log` statements to troubleshoot issues properly before attempting fixes.
*   **Caching:** **Never** change the caching strategy for the application.

### 3. Database Management (Supabase)
*   **Source of Truth:** The `supabase/migrations` folder is the **single source of truth** for the database schema.
*   **Forbidden Actions:**
    *   Do NOT manually edit the database via the Supabase Dashboard.
    *   Do NOT edit `scripts/consolidated-schema.sql`.
*   **Migration Workflow:**
    1.  **Create Migration:** `npx supabase migration new <description_of_change>`
    2.  **Edit SQL:** Write the specific SQL changes (e.g., `CREATE TABLE`, `ALTER POLICY`) in the generated file.
    3.  **Deploy:** `npx supabase db push`

## Tech Stack

*   **Framework:** Next.js 14 (App Router)
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS, Radix UI (via shadcn/ui)
*   **State Management:** Zustand (`lib/stores/`)
*   **Database/Auth:** Supabase (`@supabase/supabase-js`, `@supabase/ssr`)
*   **Maps:** Google Maps Platform (`@vis.gl/react-google-maps`)
*   **Forms:** React Hook Form + Zod
*   **Testing:** Jest + React Testing Library

## Project Structure

```
/
├── app/                 # Next.js App Router pages and API routes
│   ├── api/             # Backend API endpoints (Auth, Favorites, Trips, etc.)
│   ├── (routes)/        # Page routes (login, signup, trips, etc.)
│   └── layout.tsx       # Root layout with AuthProvider, TooltipProvider, Toaster
├── components/          # React components
│   ├── ui/              # Reusable UI components (shadcn/ui)
│   └── [feature].tsx    # Feature-specific components (e.g., trip-planner.tsx)
├── lib/                 # Core logic and types
│   ├── stores/          # Zustand state stores (userStore, tripStore, etc.)
│   ├── types.ts         # TypeScript interfaces (Winery, Trip, Visit, etc.)
│   └── supabase/        # Supabase clients (server/client/middleware)
├── supabase/            # Database configuration
│   └── migrations/      # SQL migrations (Schema Source of Truth)
└── public/              # Static assets
```

## Key Commands

*   **Development Server:** `npm run dev`
*   **Build:** `npm run build`
*   **Lint:** `npm run lint`
*   **Type Check:** `npm run type-check` (or `npx tsc --noEmit`)
*   **Test:** `npm run test`

## Development Conventions

*   **Imports:** Use absolute imports (`@/components/...`, `@/lib/...`) as defined in `tsconfig.json`.
*   **Components:** Prefer functional components with TypeScript interfaces for props.
*   **State:** Use Zustand stores for complex global state (e.g., `useTripStore`, `useWineryStore`).
*   **Styling:** Use Tailwind utility classes. Avoid custom CSS files unless necessary (`globals.css`).
*   **Icons:** Lucide React icons.

## Key Data Models (`lib/types.ts`)

*   **`Winery`:** Represents a winery location (Google Place ID, coordinates, reviews).
*   **`Trip`:** A planned itinerary containing a list of wineries and members.
*   **`Visit`:** A record of a user visiting a winery, including photos and reviews.
*   **`Friend`:** Social connection between users.

## General Considerations

*   **Error Handling:** Ensure robust error handling for API calls and user interactions.
*   **Edge Cases:** Consider valid but unusual user inputs or states.
*   **Performance:** Optimize for speed, especially with map interactions and data fetching.
*   **Best Practices:** Follow established best practices for React, Next.js, Zustand, Supabase, and the Google Maps API.