# Specification: Places API (New) Migration & Enhancement

## Overview
Migrate the application's Google Places API interactions to the "New" version (v1). This update modernizes the server-side caching logic, enriches the winery data model with high-value attributes (dog-friendly, outdoor seating, EV charging, parking), and integrates Gemini-powered AI summaries using a cost-effective "Lazy Enrichment" and "Dynamic Masking" strategy.

**CRITICAL MANDATE:** All development must strictly follow the TDD workflow and align with the Resilience Mandates established in v2.11.0 (Coordinate Standardization, Reconstitution Rule, Quota Resilience, and DOM Stability).

## Functional Requirements
1.  **API-First Backend Migration (Edge Functions):**
    *   Consolidate search and enrichment logic into **Supabase Edge Functions** (`search-wineries`, `get-winery-details`) to satisfy the "Supabase Native" mandate.
    *   **Resilience Wrapper**: All client-side invocations of these functions MUST use the `invokeFunction` resilience wrapper to handle intermittent connectivity.
    *   **Dynamic Field Masking Strategy**: 
        *   **Standard Search**: Use "Essentials SKU" (`places.id,places.displayName,places.formattedAddress,places.location,places.types,places.photos`).
        *   **Filtered Search**: Upgrade to "Enterprise + Atmosphere" masks ONLY if the user has active attribute filters (dog-friendly, etc.).
        *   **Pro Enhancement**: Include `places.routingSummaries` for ETAs.
2.  **Centralized Enrichment Service:**
    *   Implement a unified **`EnrichmentService`** (Postgres RPC + Edge Function logic) to handle the 30-day freshness policy for all AI-enriched entities (Wineries and Regions).
3.  **Data Model Enrichment & Persistence:**
    *   Update the Supabase `wineries` table schema to store:
        *   `enrichment_tier`: ('basic' | 'enriched')
        *   `last_enriched_at`: Timestamp (30-day expiry).
        *   `generative_summary`: AI-powered place summary (jsonb).
        *   `neighborhood_summary`: AI-powered area summary (jsonb).
        *   `editorial_summary`: Professional description (text).
        *   `google_maps_type_label`: Localized descriptive label (text).
        *   `primary_photo_reference`: Hero image reference.
        *   `photo_references`: Additional references (jsonb).
        *   `serves_wine`: Boolean flag (Native Google attribute).
        *   `reviews`: JSONB blob of user reviews.
        *   Boolean attributes: `allows_dogs`, `good_for_children`, `outdoor_seating`.
        *   EV Charging: `has_ev_charging` (boolean) and `ev_charge_options` (jsonb).
        *   Logistics: `parking_options` (jsonb) and `accessibility_flags` (jsonb).
    *   **ID Normalization**: Strictly enforce `Number()` conversion for all `WineryDbId` values returned from new RPCs or functions.
4.  **UI Enhancements & DOM Stability:**
    *   **Pattern Isolation**: All new UI components MUST follow the **Container/Presentational architecture**.
    *   **DOM Stability**: Components MUST use the `data-state` signaling pattern and render skeletons/errors inside a stable parent container (No early returns).
    *   **Autocomplete Migration (Cost Optimized)**: 
        *   Replace legacy search with **Places Autocomplete (New)**.
        *   **Full Session Termination**: The Autocomplete session MUST be terminated with a comprehensive `Place Details` call requesting the `ENRICHMENT_FIELD_MASK`. Since the Atmosphere SKU is triggered, this ensures all premium data (AI summaries, wine status, reviews) is bundled into the session cost at no extra charge.
    *   **Visual Enrichment**: Implement `WineryPhotoHero` (details) and thumbnail images (cards).
    *   **AI Insight Layer**: Display `generative_summary` as a high-prominence **AI Callout** at the top of the details view.
    *   **Area Context & Logistics**: Use **Accordions** for "About the Area" and "Logistics & Accessibility".

## Data Integrity & Resilience Standards
1.  **Coordinate Standardization**: Strictly enforce `latitude` and `longitude` naming conventions. All Places v1 response mapping MUST strip legacy `lat`/`lng` keys and normalize to the system-wide standard.
    *   **Naming Alignment**: Map v1 `displayName.text` to the internal `name` field and `formattedAddress` to `address`.
    *   **Property Access**: Implementation MUST use property-based access for location (e.g., `location.latitude`) and avoid legacy function calls (e.g., `location.lat()`).
2.  **Offline Availability (Master Cache)**: The new enriched attributes (`generative_summary`, boolean flags) MUST be integrated into the **Selective Data Persistence** rules for `wineryDataStore`. These attributes must remain viewable in "Read-Only Mode" when offline.
3.  **The Reconstitution Rule (WebKit Consistency)**: If Places API photos are locally cached or queued for offline interactions, they MUST be stored as **Base64 strings** to prevent detached Blob handles in Safari/WebKit. Use `stabilizePhotos` and `base64ToFile` utilities.
4.  **Sync-Lock Integrity (Revision Control)**: 
    *   All winery data updates MUST be protected by a `last_action_timestamp` or `revision_id`.
    *   **Conflict Resolution**: Background enrichment or Realtime updates MUST NOT overwrite local state if the incoming data's timestamp is older than the last local optimistic mutation.
5.  **Encrypted Offline Mutation Queue**: Any user-initiated winery mutations (Favorites, Wishlist, Adding to Trip) performed while offline MUST be stored in the **Encrypted Queue** using the `SyncService` (AES-GCM/PBKDF2).
6.  **Security Mandate (Backend)**: All new and updated Postgres RPCs MUST be defined with `SECURITY DEFINER` and explicitly `SET search_path = public, auth` to prevent search path hijacking.
7.  **Quota Resilience (UI)**: The application MUST implement a "Service Limited" state (using the `data-state` pattern) to gracefully handle Google API quota exhaustion or enrichment failures. This state MUST render within the stable parent container.

## Compliance & Terms of Service
1.  **Caching**: Place IDs (indefinite); All other attributes (30 days max).
2.  **Attribution**: "Powered by Google" and "Summarized with Gemini" (with Gemini logo) must be visible.

## Quality & Testing Requirements
1.  **Mock Integrity**: Update `MockMapsManager` to support **Versioned Intercepts** (e.g., `mockPlacesV1()`) with `displayName.text` and `location.latitude` support.
2.  **Engine Parity (Verification)**: All features MUST be verified against **Chromium**, **Firefox**, and **WebKit** (Safari). E2E tests MUST confirm that Places photos and AI summaries render correctly across all engines without hydration errors.
3.  **Performance**: Validate <1s latency for standard search.
