# Implementation Plan: Places API (New) Migration

### Phase 1: Infrastructure & Data Schema
- [ ] Task: Update Supabase schema for enriched winery attributes
    - [ ] Create migration for new columns (AI summaries, boolean attributes, accessibility flags)
    - [ ] Run `supabase db remote commit` (or apply_migration) to update local/remote schema
    - [ ] Update `lib/database.types.ts` to reflect the new schema
- [ ] Task: Update TypeScript models and `standardizeWineryData`
    - [ ] Update `Winery` interface in `lib/types.ts`
    - [ ] Update `standardizeWineryData` in `lib/utils/winery.ts` to handle new fields
- [ ] Task: Update `MockMapsManager` for New API Schema
    - [ ] Update E2E mocks to support the `places.googleapis.com/v1` response format
- [ ] Task: Conductor - User Manual Verification 'Infrastructure & Data Schema' (Protocol in workflow.md)

### Phase 2: Server-Side API Migration (TDD)
- [ ] Task: Migrate `/api/wineries` search logic
    - [ ] Write failing unit test for the new REST endpoint interaction
    - [ ] Implement `fetch` logic for `places:searchText` with Field Masks
- [ ] Task: Update background caching logic
    - [ ] Write failing test for the upsert logic including new attributes
    - [ ] Implement enriched data caching in the background process
- [ ] Task: Conductor - User Manual Verification 'Server-Side API Migration' (Protocol in workflow.md)

### Phase 3: Bulk Migration Utility
- [ ] Task: Build and execute migration script
    - [ ] Create a standalone utility/script to iterate through existing winery IDs and fetch new details
    - [ ] Run migration and verify database enrichment
- [ ] Task: Conductor - User Manual Verification 'Bulk Migration Utility' (Protocol in workflow.md)

### Phase 4: Map Filtering Logic (TDD)
- [ ] Task: Extend Map Store with new filters
    - [ ] Write failing test for filtering logic in `mapStore.ts`
    - [ ] Implement state management for new attribute filters
- [ ] Task: Implement Filter UI components
    - [ ] Write unit tests for new filter checkboxes/toggles
    - [ ] Update map filter UI to include 'Dog Friendly', 'Accessibility', etc.
- [ ] Task: Conductor - User Manual Verification 'Map Filtering Logic' (Protocol in workflow.md)

### Phase 5: UI Enhancements (TDD)
- [ ] Task: Integrate AI Summaries into Winery Details
    - [ ] Write E2E test using store-state injection to verify summary visibility
    - [ ] Implement AI summary display in `WineryDetails.tsx`
- [ ] Task: Add Quick Info Icons and Accessibility Tab
    - [ ] Write unit tests for attribute icon rendering
    - [ ] Implement icon display in cards and a dedicated accessibility section in the modal
- [ ] Task: Conductor - User Manual Verification 'UI Enhancements' (Protocol in workflow.md)
