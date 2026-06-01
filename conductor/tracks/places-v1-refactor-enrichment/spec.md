# Specification: Places API v1 Refactor & Enrichment

## Overview
This track addresses the technical debt and architectural drift in the current Google Places API implementation. While the application has transitioned to the Places v1 SDK, it currently utilizes client-side search logic, which violates the **Supabase Native** mandate and lacks the robust enrichment data model required for advanced winery filtering (Dog-friendly, EV charging, etc.) and AI summaries.

**CRITICAL MISSION:** Refactor the existing "Direct Client" search logic into **Supabase Edge Functions** and implement a fully enriched, persistent database model with 30-day cache freshness.

## Functional Requirements
1.  **Refactor Search to Edge Functions:**
    *   Move search and enrichment logic from `useWinerySearch` to a new Supabase Edge Function: `search-wineries`.
    *   **Mandate:** Client must use the `invokeFunction` resilience wrapper.
2.  **Enriched Database Model:**
    *   Update the `wineries` table to include `enrichment_tier`, `generative_summary` (AI insight), and logistical flags (Dog-friendly, EV charging, accessibility).
    *   Implement **Revision Control** (`last_action_timestamp`, `revision_id`) for conflict-free PWA syncing.
3.  **Dynamic Field Masking:**
    *   Use cost-optimized masks: **Essentials** for discovery, **Atmosphere/Pro** for enriched details.
4.  **AI Integration:**
    *   Integrate Gemini-powered summaries into the winery details view with "Summarized with Gemini" disclosure.

## Technical Mandates
- **Coordinate Standardization:** Property-based access only (`location.latitude`). No `.lat()` calls.
- **Supabase Native:** `SECURITY DEFINER` and `SET search_path` on all new database objects.
- **PWA Resilience:** Store photos as **Base64 strings** in the offline queue (Reconstitution Rule).
