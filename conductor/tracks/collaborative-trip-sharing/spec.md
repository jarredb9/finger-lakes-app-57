# Specification: Track collaborative-trip-sharing - Collaborative Trip UI & Sharing

## Objective
Build the user interface and frontend logic to support collaborative trip planning, allowing users to invite friends and manage shared itineraries. This leverages the normalized `trip_members` architecture implemented in Track 1.

## Dependencies
- **Track 1:** Must have `trip_members` join table and related RPCs (`add_trip_member_by_email`, `get_trip_details`, `create_trip_with_winery`).

## Technical Mandates (Architecture)
- **Singleton Modals:** All new dialogs/modals (Sharing, Members Management, etc.) **MUST** be implemented as global singletons rendered at the root of `layout.tsx` (outside the `AuthProvider` loading boundary). State must be managed in `useUIStore`. Do not render dialogs inside list items (e.g., `TripCardSimple`).
- **Database Hardening:** All new Postgres functions (RPCs) **MUST** explicitly set `SET search_path = public, auth`. Logic must use `auth.uid()` securely and handle cases where it might be NULL.
- **State Persistence:** UI visibility state for active modals/dialogs (e.g., `isOpen`) **MUST NOT** be persisted in `localStorage`. Only functional data (e.g., `shareTripId`) may be persisted if needed for deep linking, but visibility must be transient to prevent hydration race conditions in E2E tests.
- **Type Safety:** RPC return types must be explicitly cast in `RETURN QUERY` statements (e.g., `col::text`) to prevent "result type mismatch" errors in PostgREST.

## Scope

### 1. Share UI
- **TripShareDialog:** A global singleton modal using Radix/shadcn `Dialog` to search for friends by email or select from a friend list.
- **Invitation Logic:** Integration with `add_trip_member_by_email` RPC to securely add members to `trip_members`.
- **Entry Points:** "Share" buttons added to `TripCardSimple` (sidebar list) and `TripCard` (detail view).

### 2. Collaborative Visibility
- **Member Avatars:** Update `TripCardSimple` and `TripCard` to display avatars of all members fetched via `get_trip_details`.
- **Members List:** A dedicated section in the Trip Detail view (`TripCard`) or sidebar to view all participants and their roles (Owner/Member).

### 3. Real-time Collaboration
- **Real-time Sync:** Enable Supabase Realtime subscriptions for `trip_members` and `trip_wineries` tables in `tripStore.ts`.
- **UI Responsiveness:** Implement optimistic updates for member additions and itinerary changes (reordering, notes).

### 4. Permissions & Security
- **Role Enforcement:** Ensure that only authorized members can edit the trip (winery reordering, adding/removing wineries, updating notes).
- **Owner-Only Actions:** Restrict trip deletion and member removal (of others) to the trip owner.

## Success Criteria
1. Users can successfully invite a friend to a trip via email.
2. Multiple users can see and edit the same trip itinerary simultaneously.
3. Trip owner can successfully remove a member from a trip.
4. All itinerary updates (reordering, notes) are synced in real-time across all active members.
5. Unauthorized users (non-members) are blocked from viewing or editing private trips.

## Validation Strategy
- **Direct-to-DB Verification:** Before completing a backend task, the agent **MUST** verify the RPC using `execute_sql` with a manual `auth.uid()` simulation.
- **Cross-Browser Smoke Test:** Every UI change must be verified in the rootless Playwright container on at least `chromium` and `webkit`.
- **Scoped Locators:** E2E tests must use scoped locators (e.g., `page.locator('main')`) to disambiguate between sidebar and detail view components.
