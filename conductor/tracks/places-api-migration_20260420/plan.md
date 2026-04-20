# Implementation Plan: Places API (New) Migration (Lazy Enrichment)

### Phase 1: Infrastructure & Data Schema
- [ ] Task: Update Supabase schema for enriched winery attributes
    - [ ] Create migration for new columns: ai_summary, allows_dogs, good_for_children, outdoor_seating, ev_charging, parking_options, accessibility_flags
    - [ ] Run `supabase db remote commit` (or apply_migration) to update local/remote schema
    - [ ] Update `lib/database.types.ts` to reflect the new schema
- [ ] Task: Update TypeScript models and `standardizeWineryData`
    - [ ] Update `Winery` interface in `lib/types.ts`
    - [ ] Update `standardizeWineryData` in `lib/utils/winery.ts` to handle new fields
- [ ] Task: Update Mock Data & MockMapsManager
    - [ ] Update E2E mocks with the new REST-style JSON responses from Places API v1
    - [ ] Update `MockMapsManager` in `e2e/helpers.ts` to support the new v1 response structure and field-mask logic
- [ ] Task: Conductor - User Manual Verification 'Infrastructure & Data Schema' (Protocol in workflow.md)

### Phase 2: Server-Side API Migration & Lazy Enrichment (TDD)
- [ ] Task: Migrate `/api/wineries` search logic
    - [ ] Write failing unit test for the new REST endpoint interaction (`places:searchText`)
    - [ ] Implement fetch logic using the Essentials SKU field mask (ID, Name, Location)
- [ ] Task: Implement Lazy Enrichment Logic
    - [ ] Write failing test for the "Detail Fetch" trigger that checks if Enterprise data is missing
    - [ ] Implement server-side logic to fetch Enterprise SKU data (AI summaries, attributes, EV, Parking, goodForChildren) only if not already cached
- [ ] Task: Conductor - User Manual Verification 'Server-Side API Migration' (Protocol in workflow.md)

### Phase 3: Map Filtering Logic (TDD)
- [ ] Task: Extend Map Store with new filters
    - [ ] Write failing test for filtering logic in `mapStore.ts`
    - [ ] Implement state management for new attribute filters (e.g., `allowsDogs`, `goodForChildren`, `outdoorSeating`, `evCharging`)
- [ ] Task: Implement Filter UI components
    - [ ] Write unit tests for new filter checkboxes/toggles
    - [ ] Update map filter UI to include 'Dog Friendly', 'Kid Friendly', 'Outdoor Seating', and 'EV Charging'
- [ ] Task: Conductor - User Manual Verification 'Map Filtering Logic' (Protocol in workflow.md)

### Phase 4: UI Enhancements & Migration (TDD)
- [ ] Task: Integrate AI Summaries into Winery Details
    - [ ] Write E2E test using store-state injection to verify summary visibility
    - [ ] Implement AI summary display in `WineryDetails.tsx`
- [ ] Task: Add Quick Info Icons and Accessibility Tab
    - [ ] Write unit tests for attribute icon rendering
    - [ ] Implement icon display in cards and a dedicated accessibility/logistics section in the modal
- [ ] Task: Refactor `WineryQnA.tsx` to use structured data
    - [ ] Update `WineryQnA` to check `allowsDogs` and `goodForChildren` booleans first
    - [ ] Display "Confirmed by Google" status for structured attributes
    - [ ] Maintain review-search as a secondary fallback for non-structured questions
- [ ] Task: Conductor - User Manual Verification 'UI Enhancements' (Protocol in workflow.md)
