# Specification: Places API (New) Migration & Enhancement

## Overview
Migrate the application's Google Places API interactions to the "New" version (v1). This update modernizes the server-side caching logic, enriches the winery data model with high-value attributes (dog-friendly, outdoor seating, EV charging, parking), and integrates Gemini-powered AI summaries using a cost-effective "Lazy Enrichment" and "Dynamic Masking" strategy.

**CRITICAL MANDATE:** All development must strictly follow the TDD workflow. No implementation code shall be written without a corresponding failing test.

## Functional Requirements
1.  **API-First Backend Migration (Edge Functions):**
    *   Consolidate search and enrichment logic into **Supabase Edge Functions** (`search-wineries`, `get-winery-details`) to satisfy the "Supabase Native" mandate.
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
        *   Boolean attributes: `allows_dogs`, `good_for_children`, `outdoor_seating`.
        *   EV Charging: `has_ev_charging` (boolean) and `ev_charge_options` (jsonb).
        *   Logistics: `parking_options` (jsonb) and `accessibility_flags` (jsonb).
4.  **UI Enhancements:**
    *   **Visual Enrichment**: Implement `WineryPhotoHero` (details) and thumbnail images (cards).
    *   **Autocomplete Migration**: Replace legacy search with **Places Autocomplete (New)**.
    *   **AI Insight Layer**: Display `generative_summary` as a high-prominence **AI Callout** at the top of the details view.
    *   **Area Context & Logistics**: Use **Accordions** for "About the Area" and "Logistics & Accessibility".

## Compliance & Terms of Service
1.  **Caching**: Place IDs (indefinite); All other attributes (30 days max).
2.  **Attribution**: "Powered by Google" and "Summarized with Gemini" (with Gemini logo) must be visible.

## Quality & Testing Requirements
1.  **Mock Integrity**: Update `MockMapsManager` to support **Versioned Intercepts** (e.g., `mockPlacesV1()`) with `displayName.text` and `location.latitude` support.
2.  **Performance**: Validate <1s latency for standard search.
