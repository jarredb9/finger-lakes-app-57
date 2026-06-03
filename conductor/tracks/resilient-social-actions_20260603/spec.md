# Specification: Resilient Social Actions Migration

## Overview
This track focuses on migrating high-value user interaction RPCs (`log_visit`, `update_visit`, `create_trip`) to Supabase Edge Functions. The goal is to enhance PWA resilience through standardized retry/queueing logic and to enable extensible backend side-effects like AI-driven winery summary updates and privacy-aware social notifications.

## Functional Requirements
1. **Migrate Visit Logging (`log-visit`):**
    - Replace the `log_visit` RPC with a Deno Edge Function.
    - **Side Effect**: Trigger a Gemini summary update for the winery if the user review meets a "detail threshold" (e.g., >100 characters).
    - **Side Effect**: Post to the `activity_ledger` and notify friends, strictly respecting `public.is_visible_to_viewer` and the user's privacy settings.
2. **Migrate Trip Creation (`create-trip`):**
    - Replace `create_trip` and `create_trip_with_winery` with a consolidated `manage-trips` Edge Function.
    - **Resilience**: Ensure trip creation is queued in IndexedDB if the user is offline, using the existing PWA resilience patterns.
3. **PWA Resilience Integration:**
    - All client-side invocations MUST use the `invokeFunction` resilience wrapper.
    - Implement a "Retry with Backoff" strategy for failed social actions.
4. **Selective Migration Mandate:**
    - Only migrate functions where the transition to Edge Functions provides a tangible benefit (e.g., orchestration of 3rd party APIs, AI integration, or complex normalization). Relational-only logic stays in Postgres RPCs.

## Technical Mandates
- **Hybrid Pattern:** Edge Functions will still call existing transactional RPCs (like `bulk_upsert_wineries` or join-table inserts) to ensure atomicity.
- **Full Normalization:** All incoming winery data from user actions MUST pass through the `_shared/normalization.ts` utility.
- **Privacy-First Notifications:** Social notification triggers MUST perform a `is_visible_to_viewer` check before emitting events to the Realtime bus.
- **Coordinate Standardization:** Enforce property-based `latitude`/`longitude` mapping across all migrated flows.

## Acceptance Criteria
- 100% unit test coverage for new Edge Functions (Deno).
- Social notifications are successfully suppressed for "Private" visits.
- Visits logged while offline successfully sync once connectivity is restored.
- Gemini summaries are updated in the background after a detailed visit log.
