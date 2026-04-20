# Specification: Places API (New) Migration & Enhancement

## Overview
Migrate the application's Google Places API interactions to the "New" version (v1). This update will modernize the server-side caching logic, enrich the winery data model with high-value attributes (e.g., dog-friendly, outdoor seating, accessibility), and integrate Gemini-powered AI summaries into the user experience.

**CRITICAL MANDATE:** All development must strictly follow the TDD (Test-Driven Development) workflow. No implementation code shall be written without a corresponding failing test. All testing must adhere to the senior-level architectural standards defined in the `project-testing-best-practices` skill.

## Functional Requirements
1.  **Server-Side Migration:**
    *   Replace the legacy Text Search API in `app/api/wineries/route.ts` with the New Places API `searchText` endpoint.
    *   Implement the New Places API in background caching logic to fetch enriched fields.
2.  **Data Model Enrichment:**
    *   Update the Supabase `wineries` table schema to store:
        *   AI Summaries (Place and Review summaries).
        *   Boolean attributes: `allowsDogs`, `outdoorSeating`, `liveMusic`, `menuForChildren`.
        *   Accessibility flags: `wheelchairAccessibleEntrance`, `wheelchairAccessibleRestroom`, etc.
3.  **Bulk Migration Utility:**
    *   Create a one-time migration script/utility to refresh all existing `google_place_id` records in the database with the new fields.
4.  **UI Enhancements:**
    *   **Detail Highlights:** Display AI-generated summaries at the top of the Winery Details modal.
    *   **Quick Info Icons:** Add visual icons for attributes (e.g., dog-friendly, outdoor seating) to winery cards and details.
    *   **Accessibility Section:** Add a clear section for accessibility information.
5.  **Search & Filtering:**
    *   Update the map search filters to allow users to find wineries based on the new attributes (e.g., "Filter by: Dog Friendly").

## Quality & Testing Requirements
1.  **TDD Protocol:** Each sub-task must begin with a failing unit or integration test.
2.  **E2E Standards:** Utilize `page.evaluate` for store-state injection to verify UI states, avoiding navigation-heavy chains.
3.  **Mock Integrity:** Update the `MockMapsManager` to support the New Places API schema to ensure regression testing is accurate.

## Acceptance Criteria
*   `/api/wineries` uses the `places.googleapis.com/v1` endpoint and passes TDD verification.
*   Existing wineries in the database are successfully enriched via the migration utility.
*   AI summaries and accessibility data are correctly rendered in the UI and verified via E2E tests.
*   Map filters correctly filter results using the new attributes.
