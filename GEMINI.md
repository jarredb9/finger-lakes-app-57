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
    *   **Do NOT edit existing migration files.** Once a migration file is created and committed, it is immutable.
*   **Migration Workflow:**
    *   ALWAYS create a **new** migration file for ANY database change.
    *   Preferred command: `npx supabase migration new <description_of_change>`
    *   If the command fails (e.g., due to missing Docker), create a new file manually in `supabase/migrations/` with the format `YYYYMMDDHHMMSS_description.sql`, ensuring the timestamp is strictly sequential and newer than the latest existing file.
    *   **Edit SQL:** Write the specific SQL changes (e.g., `CREATE TABLE`, `ALTER POLICY`) in the newly generated file.
    *   **Deploy:** `npx supabase db push`

### 4. Middleware Configuration
*   **File:** `proxy.ts` is used instead of `middleware.ts`.
*   **Context:** This project uses Next.js 16+. The standard `middleware.ts` convention is replaced by `proxy.ts` for handling middleware logic (auth checks, session updates). Do not create a `middleware.ts` file.

## Tech Stack

*   **Framework:** Next.js 16 (App Router)
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS, Radix UI (via shadcn/ui)
*   **State Management:** Zustand (`lib/stores/`)
*   **Database/Auth:** Supabase (`@supabase/supabase-js`, `@supabase/ssr`)
*   **Maps:** Google Maps Platform (`@vis.gl/react-google-maps`)
*   **Forms:** React Hook Form + Zod
*   **Testing:** Jest + React Testing Library

## System Architecture & Patterns

### 1. State Management & Data Flow
*   **Zustand Stores (`lib/stores/`):** The primary source of truth for client-side state.
    *   **`wineryStore`:** Manages the global list of wineries, favorites, and wishlist items. Handles lightweight "map markers" vs. heavy "detailed data" lazy loading.
    *   **`tripStore`:** Manages trip creation, updates, and the "Active Trip" state (`selectedTrip`) for the map overlay.
    *   **`visitStore`:** Manages logging and updating user visits.
*   **Service Layer (`lib/services/`):** Static classes that encapsulate API calls. Stores call Services; Components call Stores.
*   **Authentication:** Handled via **Server Actions** in `app/actions.ts` (e.g., `login`). We **do not** use `app/api/auth/login/route.ts` (it was removed).

### 2. Optimistic Updates Strategy
We use a comprehensive optimistic update strategy to ensure UI responsiveness.
*   **Pattern:** Update Zustand store immediately -> Call API/RPC -> Revert store on error -> (Optional) Refetch/Confirm on success.
*   **Key Implementations:**
    *   **`saveVisit` (`visitStore`):** Creates a temporary visit object with a temp ID (`temp-${Date.now()}`), adds it via `wineryStore.addVisitToWinery`, then replaces it with the real DB record using `wineryStore.replaceVisit` upon success.
    *   **`respondToRequest` (`friendStore`):** Immediately moves friend from "Requests" to "Friends" list before API call.
    *   **`addWineryToTrips` (`tripStore`):** For *existing* trips, we optimistically append the winery to the `trips` and `tripsForDate` arrays. For *new* trips, we wait for the server (due to ID generation complexity).
    *   **`removeFriend` (`friendStore`):** Optimistically removes a friend from the `friends` list or a sent request from the `sentRequests` list before the API call.

### 3. Navigation & Map Context Logic
*   **Active Trip (`selectedTrip`):**
    *   **Activation:** Occurs when a user selects a trip from the dropdown on the Map controls OR clicks the "On Trip" badge in a `WineryModal`.
    *   **Persistence:** This state is global (Zustand) and persists across client-side navigation.
    *   **Reset Rule:** To prevents the map from getting "stuck" on a trip, navigating to a **Trip Details Page** (`/trips/[id]`) **MUST** explicitly clear the active trip (`setSelectedTrip(null)`) on mount. This ensures that returning to the Explore tab starts with a clean map context.

### 4. Friend Request Notifications
*   **Immediate Fetch:** Friend data, including pending requests, is now fetched immediately upon user authentication via `AuthProvider` to ensure notification badges are always up-to-date.
*   **Notification Badges:** Visual indicators (red circles with counts) are displayed on the "Friends" tab in both desktop (AppSidebar) and mobile (AppShell) views to highlight pending friend requests.

### 5. API & Component Structure Notes
*   **Component Naming:**
    *   `VisitCardHistory.tsx`: The reusable UI card/list component.
    *   `VisitHistoryView.tsx`: The full-page view wrapper (used in Tabs).
*   **Unused/Removed:**
    *   `app/api/auth/login/route.ts`: Removed (Use Server Actions).
    *   `app/api/wineries/[id]/route.ts`: Removed (Use `details` or `list` endpoints).
    *   `components/theme-provider.tsx`: Removed (Unused).

## Key References (Maps & Tools)

### UI Architecture (Layout)
*   **Responsive Controller:** `AppShell` (`components/app-shell.tsx`) is the central orchestrator. It manages the state for switching between the **Desktop Sidebar** (`AppSidebar`) and the **Mobile Bottom Drawer** (`InteractiveBottomSheet`). It does **not** rely on media queries in CSS alone; it uses the `useIsMobile` hook to conditionally render the correct container.
*   **Modals:** `WineryModal` is rendered at the root level in `AppShell` but controlled via `uiStore` to allow triggering from anywhere (Map, Sidebar, etc.).

### Key Database RPCs (Power Tools)
*   **Data Fetching:**
    *   `get_map_markers()`: Lightweight, high-performance fetch for the initial map load.
    *   `get_winery_details_by_id(id)`: Lazy-loads full details (reviews, hours) only when a modal is opened.
    *   `get_all_user_visits_list()`: Aggregates all user visits for the history view.
*   **Logic & Transactions:**
    *   `create_trip_with_winery()`: Atomically creates a trip and adds the first winery.
    *   `add_winery_to_trip()`: Handles the upsert logic for wineries when adding to a trip.
    *   `remove_winery_from_trip()`: Safely removes a winery from a trip.

### Social Graph Management
*   `remove_friend(target_friend_id)`: Deletes a friendship record between the current user and `target_friend_id`, used for both removing friends and cancelling sent requests.
*   `get_friends_and_requests()`: Fetches the social graph, now including accepted friends, incoming friend requests, and outgoing (sent) friend requests in a single round-trip.

### Core Custom Hooks
*   **`useWineryMap`:** The "Brain" of the map view. Aggregates store data, handles map clicks (fetching details for non-DB places), and manages the Google Maps instance.
*   **`useTripActions`:** Encapsulates trip-specific logic like "Export to Google Maps" and Friend selection for trip members.

## Project Structure

```
/
├── app/                 # Next.js App Router pages and API routes
│   ├── actions.ts       # Server Actions (Auth, Favorites)
│   ├── api/             # Backend API endpoints
│   ├── (routes)/        # Page routes
│   └── layout.tsx       # Root layout
├── proxy.ts             # Middleware logic
├── components/          # React components
│   ├── ui/              # Reusable UI components (shadcn/ui)
│   ├── VisitCardHistory.tsx # Reusable history list
│   ├── VisitHistoryView.tsx # Full page history view
│   └── [feature].tsx    # Feature-specific components
├── lib/                 # Core logic
│   ├── stores/          # Zustand stores (Logic Hub)
│   ├── services/        # Service layer (API Wrappers)
│   └── types.ts         # TypeScript interfaces
└── supabase/            # Database configuration
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
*   **State:** Use Zustand stores for complex global state.
*   **Services:** Use dedicated services in `lib/services/` for API logic.
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

## Common Pitfalls & "Gotchas" (Read Before Coding)

### 1. The Dual-ID System (Critical)
*   **Concept:** Wineries have **two** identifiers:
    *   `id` (String): The Google Place ID. Used for API lookups and Map markers.
    *   `dbId` (Number): The Supabase Primary Key. Used for relational data (visits, favorites, trips).
*   **The Trap:** Mixing these up causes foreign key constraints to fail or lookups to return null.
*   **The Fix:** Always verify which ID an RPC expects. Most "heavy" RPCs (`add_winery_to_trip`) handle the upsert/lookup automatically using the Google ID (`id`), but deletions (`remove_winery_from_trip`) strictly require the `dbId`.

### 2. Derived State in Optimistic Updates
*   **Concept:** Zustand stores often have derived arrays (e.g., `trips` vs `tripsForDate`).
*   **The Trap:** Updating the "main" array (`trips`) during an optimistic update **does not** automatically re-compute the derived array (`tripsForDate`) if the logic is manual. This leads to UI lag where one view updates but another doesn't.
*   **The Fix:** When writing optimistic logic in a store, you must manually update **all** relevant state arrays (e.g., `set({ trips: ..., tripsForDate: ... })`).

### 3. Testing Zustand with Mocks
*   **Concept:** We use `jest.mock` to bypass the actual Zustand store implementation in component tests.
*   **The Trap:** Tests will crash with `TypeError: func is not a function` if you add a new action to the Store but forget to add a mock implementation for it in the test file (e.g., `setSelectedTrip`).
*   **The Fix:** Always check the `beforeEach` block in the test file and ensure the mock implementation returns a complete state object matching the interface required by the component under test.