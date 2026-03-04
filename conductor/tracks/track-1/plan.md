# Plan: Track 1 - Social Infrastructure Refactor (Backend)

## Phase 1: Database Schema & Migration (Foundation)
Objective: Implement the new tables and migrate existing data.

- [x] Task 1: Create `trip_members` join table with Foreign Key constraints and `ON DELETE CASCADE`. (f56e2a1)
- [x] Task 2: Write a one-time migration script (SQL) to backfill `trip_members` from `trips.members` array. (a1b2c3d)
- [x] Task 3: Create `visit_participants` table to support social tagging. (e4f5g6h)
- [x] Task 4: Add `metadata` JSONB columns to `visits`, `favorites`, and `wishlist` tables. (i7j8k9l)
- [ ] Task 5: Implement `activity_ledger` table with appropriate indexes (GIN on metadata, indexing on user_id and privacy_level).

## Phase 2: Asymmetric Social Model
Objective: Support Followers/Following.

- [ ] Task 1: Refactor `friends` table or create `follows` table to support asymmetric relationships.
- [ ] Task 2: Implement `send_follow_request` and `respond_to_follow_request` RPCs.
- [ ] Task 3: Update RLS policies to allow public profile followers to view public content.

## Phase 3: RPC Refactoring (API Compatibility)
Objective: Update existing business logic to use the new schema.

- [ ] Task 1: Refactor `get_trip_details` RPC to use the `trip_members` table instead of the `trips.members` array.
- [ ] Task 2: Refactor `create_trip_with_winery` and other trip mutation RPCs to manage `trip_members`.
- [ ] Task 3: Refactor `get_friend_activity_feed` to pull from the `activity_ledger` table.
- [ ] Task 4: Implement a trigger or automated process to push social events into the `activity_ledger`.
- [ ] Task 5: Update `get_friends_activity_for_winery` and related social discovery RPCs.

## Phase 4: Validation & Cleanup
Objective: Ensure system stability and remove legacy code.

- [ ] Task 1: Run full E2E test suite (`./scripts/run-e2e-container.sh chromium`) to verify zero regressions.
- [ ] Task 2: Run all Jest unit tests (`npm test`).
- [ ] Task 3: Perform a security audit of the new RLS policies using `is_visible_to_viewer` helper.
- [ ] Task 4: (Cleanup) Deprecate and remove the `members` column from the `trips` table.
- [ ] Task 5: Final documentation update (ERD and API contracts).
