# Specification: Places API (New) Migration & Enhancement

## Overview
Migrate the application's Google Places API interactions to the "New" version (v1). This update will modernize the server-side caching logic, enrich the winery data model with high-value attributes (e.g., dog-friendly, outdoor seating, EV charging, parking), and integrate Gemini-powered AI summaries into the user experience using a cost-effective "Lazy Enrichment" strategy.

**CRITICAL MANDATE:** All development must strictly follow the TDD (Test-Driven Development) workflow. No implementation code shall be written without a corresponding failing test. All testing must adhere to the senior-level architectural standards defined in the `project-testing-best-practices` skill.

## Functional Requirements
1.  **Server-Side Migration:**
    *   Replace the legacy Text Search API in `app/api/wineries/route.ts` with the New Places API `searchText` endpoint.
    *   Implement **Lazy Enrichment**: Fetch Enterprise-tier data (AI summaries, attributes) only when a user requests details for a winery not yet fully cached.
2.  **Data Model Enrichment:**
    *   Update the Supabase `wineries` table schema to store:
        *   AI Summaries (Place and Review summaries).
        *   Boolean attributes: `allowsDogs`, `goodForChildren`, `outdoorSeating`, `evCharging` (from `evChargeOptions`).
        *   Logistics: `parkingOptions` (Free, Paid, Street, etc.).
        *   Accessibility flags: `wheelchairAccessibleEntrance`, `wheelchairAccessibleRestroom`.
3.  **UI Enhancements:**
    *   **Detail Highlights:** Display AI-generated summaries at the top of the Winery Details modal.
    *   **Quick Info Icons:** Add visual icons for Dog-Friendly, Kid-Friendly, Outdoor Seating, and EV Charging to cards and details.
    *   **Logistics & Accessibility:** Add dedicated sections for parking and accessibility information in the detail view.
4.  **Search & Filtering:**
    *   Update the map search filters to allow users to filter by `allowsDogs`, `goodForChildren`, `outdoorSeating`, and `evCharging`.

## Quality & Testing Requirements
1.  **TDD Protocol:** Each sub-task must begin with a failing unit or integration test.
2.  **E2E Standards:** Utilize `page.evaluate` for store-state injection to verify UI states.
3.  **Mock Integrity:** Update the `MockMapsManager` to support the New Places API v1 schema and field-masking logic.

## Acceptance Criteria
*   `/api/wineries` search uses the Essentials SKU mask to keep costs low.
*   Enrichment calls only trigger for missing data and use the Enterprise SKU mask.
*   AI summaries, Dog-Friendly status, and EV Charging icons are correctly rendered and verified.
*   Map filters correctly filter results using the new attributes.
