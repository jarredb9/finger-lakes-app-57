# Specification: Places API (New) Migration & Enhancement

## Overview
Migrate the application's Google Places API interactions to the "New" version (v1). This update modernizes the server-side caching logic, enriches the winery data model with high-value attributes (dog-friendly, outdoor seating, EV charging, parking), and integrates Gemini-powered AI summaries into the user experience using a cost-effective "Lazy Enrichment" and "Dynamic Masking" strategy.

**CRITICAL MANDATE:** All development must strictly follow the TDD (Test-Driven Development) workflow. No implementation code shall be written without a corresponding failing test. All testing must adhere to the senior-level architectural standards defined in the `project-testing-best-practices` skill.

## Functional Requirements
1.  **API-First Backend Migration:**
    *   Consolidate search and enrichment logic into **Supabase Edge Functions** (`search-wineries`, `get-winery-details`) to ensure a platform-agnostic backend.
    *   **Dynamic Field Masking Strategy**: 
        *   **Standard Search**: Use "Essentials SKU" (`places.id,places.displayName,places.formattedAddress,places.location,places.types,places.photos`) to keep costs low.
        *   **Filtered Search**: Automatically upgrade to "Enterprise + Atmosphere" masks ONLY if the user has active attribute filters (dog-friendly, etc.) to allow server-side filtering.
        *   **Pro Enhancement**: Include `places.routingSummaries` in search to provide ETAs. Use the current Map Center as the default origin for calculations.
    *   **Lazy Enrichment**: Fetch "Enterprise + Atmosphere" data (AI summaries, attributes, full photo set) only when a user requests details for a winery not yet fully cached or where the cache has expired (30-day limit).
2.  **Data Model Enrichment & Persistence:**
    *   **V1 Mapping Logic**: Explicitly handle `displayName.text` for winery names and `location.latitude/longitude` for coordinates to support the v1 JSON structure.
    *   Update the Supabase `wineries` table schema to store:
        *   `enrichment_tier`: ('basic' | 'enriched') to persist the cache state.
        *   `last_enriched_at`: Timestamp to enforce the 30-day Google caching policy.
        *   `generative_summary`: AI-powered place summary (jsonb).
        *   `neighborhood_summary`: AI-powered area summary (jsonb).
        *   `editorial_summary`: Professional description (text).
        *   `google_maps_type_label`: Localized descriptive label (text).
        *   `primary_photo_reference`: Text reference for the hero image.
        *   `photo_references`: Array of additional photo references (jsonb).
        *   Boolean attributes: `allows_dogs`, `good_for_children`, `outdoor_seating`.
        *   EV Charging: `has_ev_charging` (boolean) and `ev_charge_options` (jsonb).
        *   Logistics: `parking_options` (jsonb) and `accessibility_flags` (jsonb).
3.  **UI Enhancements:**
    *   **Visual Enrichment**: Implement a `WineryPhotoHero` (details) and thumbnail image (cards) using `GetPhotoMedia` to ensure a modern, polished aesthetic.
    *   **Autocomplete Migration**: Replace the legacy text-based location search with the **Places Autocomplete (New)** component for a faster, professional entry experience.
    *   **AI Insight Layer**: Display `generative_summary` as a high-prominence **AI Callout** with a distinct background. Position it at the top of the details view to serve as a "Quick Vibe" summary.
    *   **Area Context & Logistics**: Use **Accordions** for secondary information:
        *   **"About the Area"**: Contains `neighborhood_summary`.
        *   **"Logistics & Accessibility"**: Contains parking, EV charging details, and accessibility flags.
    *   **Attribute Grid**: Implement a compact **Icon Grid** (3-4 columns) in the details view for boolean attributes. In cards, only display a "Hero Attribute" badge (e.g., "Dogs Welcome") if applicable.
    *   **Accessible Icons**: All icons MUST include ARIA labels and tooltip support.
    *   **2026 Badging**: Display the `google_maps_type_label` (e.g., "Hidden Gem") as a compact **Badge** on winery thumbnails in the bottom sheet.
    *   **Collapsible Trip Planner**: On mobile devices, the `TripPlannerSection` MUST be collapsed by default unless the user is actively viewing a trip.


## Compliance & Terms of Service
1.  **Caching Limits:** Place IDs may be cached indefinitely. All other Place Details (attributes, summaries, reviews, photos) MUST NOT be cached for longer than 30 days.
2.  **Attribution:** All UI views displaying Google Place data must include "Powered by Google" branding. 
3.  **AI Disclosure:** All AI summaries MUST display the disclosure text **"Summarized with Gemini"** and the Gemini logo, positioned immediately adjacent to the AI-generated content.

## Quality & Testing Requirements
1.  **TDD Protocol:** Each sub-task must begin with a failing unit or integration test.
2.  **E2E Standards:** Utilize `page.evaluate` for store-state injection to verify UI states.
3.  **Mock Integrity:** Update the `MockMapsManager` to support the v1 schema (`displayName.text`, `location.latitude`).
4.  **Performance Benchmarking:** Validate that Essentials-tier searches remain performant and that Edge Function execution (including background upserts) does not exceed 1s latency for the initial response.


## Acceptance Criteria
*   `/api/wineries` search uses the Essentials SKU mask by default via the Edge Function.
*   Autocomplete (New) is used for location discovery.
*   Enrichment calls only trigger for missing/expired data and use the Enterprise + Atmosphere SKU.
*   `enrichment_tier` correctly persists in the database to prevent redundant API calls.
*   AI summaries, photos, and Dog-Friendly icons are correctly rendered and verified in E2E tests.
*   Map filters correctly filter results using the new attributes in both the UI and the Database RPCs.
*   "Powered by Google" and "Summarized with Gemini" attributions are visible on all relevant views.
