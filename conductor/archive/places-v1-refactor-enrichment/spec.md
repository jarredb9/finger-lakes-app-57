# Specification: Places API v1 Refactor & Enrichment

## Overview
This track addresses the technical debt and architectural drift in the current Google Places API implementation. While the application has transitioned to the Places v1 SDK, it currently utilizes client-side search logic, which violates the **Supabase Native** mandate and lacks the robust enrichment data model required for advanced winery filtering (Dog-friendly, EV charging, etc.) and AI summaries.

**CRITICAL MISSION:** Refactor the existing "Direct Client" search logic into **Supabase Edge Functions** and implement a fully enriched, persistent database model with 30-day cache freshness.

## Functional Requirements
1.  **Refactor Search to Edge Functions:**
    *   Move search and enrichment logic from `useWinerySearch` to a new Supabase Edge Function: `search-wineries`.
    *   **Resilience Wrapper**: All client-side invocations of these functions MUST use the `invokeFunction` resilience wrapper to handle intermittent connectivity.
    *   **Dynamic Field Masking Strategy**: 
        *   **Standard Search**: Use "Essentials SKU" (`places.id,places.displayName,places.formattedAddress,places.location,places.types,places.photos`).
        *   **Filtered Search**: Upgrade to "Enterprise + Atmosphere" masks ONLY if the user has active attribute filters (dog-friendly, etc.).
        *   **Pro Enhancement**: Include `places.routingSummaries` for ETAs.
2.  **Enriched Database Model & Centralized Service:**
    *   Update the `wineries` table to include `enrichment_tier`, `generative_summary` (AI insight), and logistical flags (Dog-friendly, EV charging, accessibility).
    *   Implement **Revision Control** (`last_action_timestamp`, `revision_id`) for conflict-free PWA syncing.
    *   Utilize the **`EnrichmentService`** to handle the 30-day freshness policy for all AI-enriched entities.
3.  **AI Integration & UI Enhancements:**
    *   Integrate Gemini-powered summaries into the winery details view with "Summarized with Gemini" disclosure.
    *   **UI Structure**: Use **Accordions** for "About the Area" and "Logistics & Accessibility" in `WineryDetails.tsx`.
    *   **DOM Stability**: Components MUST use the `data-state` signaling pattern and render skeletons/errors inside a stable parent container (No early returns).
    *   **Quota Resilience**: Implement a "Service Limited" state (using the `data-state` pattern) to gracefully handle Google API quota exhaustion.
    *   **Three-State Logistics UI**: Differentiate between `true` (Yes), `false` (No), and `null`/`undefined` (Unknown) states for logistics attributes (dogs allowed, kid friendly, outdoor seating, EV charging, serves wine). For the unknown state, display a neutral badge (e.g. gray question mark) and provide a fallback trigger/action to show the Q&A reviews search fallback.
4.  **DevSecOps & Migration Stability (Safety Mandate):**
    *   **Structural Audit (Gold Standard):** Implement `supabase db diff --linked` in CI. This spins up a shadow database to compare the *actual schema result* of local migrations against the live production database.
    *   **History Auditing:** Use `supabase migration list` in CI to ensure the local file list perfectly matches the remote migration history.
    *   **Type Parity:** Enforce `supabase gen types` verification in CI to ensure the frontend `database.types.ts` is in sync with the current migrations.

## Technical Mandates
- **Hybrid Implementation Pattern:** Use Edge Functions for orchestration, external API calls, and logic-heavy normalization. Use specialized Database RPCs (invoked by the Edge Function) for complex, high-volume database operations to ensure atomicity and performance.
- **Lazy Enrichment Pattern:** Implement a "Cache-First" strategy in Edge Functions: check the local database for fresh data (<30 days) before initiating external Google Places API calls.
- **Fat Function Architecture:** Prefer fewer, more robust Edge Functions over many micro-functions. Related logic (e.g., search vs details) should share normalization utilities in the `_shared/` directory to ensure cross-backend parity.
- **Coordinate Standardization:** Property-based access only (`location.latitude`). No `.lat()` calls. All mapping MUST strip legacy `lat`/`lng` keys.
- **Supabase Native:** `SECURITY DEFINER` and `SET search_path = public, auth` on all new database objects.
- **PWA Resilience (Reconstitution Rule):** Store photos as **Base64 strings** in the offline queue/cache to prevent detached Blob handles in Safari/WebKit.
- **Zero-Desync CI:** The pipeline MUST fail if local migrations do not perfectly match the remote target schema.
- **ID Normalization**: Strictly enforce `Number()` conversion for all `WineryDbId` values returned from new RPCs or functions.
- **Backend Testing Infrastructure (Deno)**: Implement local Deno testing for all Edge Functions. This includes:
    *   **Unit Testing**: High-speed verification of normalization logic, field masking, and error handling.
    *   **Mocking**: Use `deno_std/testing` or equivalent to mock Google Places API and Supabase RPCs, ensuring no quota usage during testing.
    *   **CI Parity**: Ensure Deno tests run in the CI pipeline to catch regression in backend logic.
