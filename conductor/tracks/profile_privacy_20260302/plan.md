# Implementation Plan: Modify Friend Profile Privacy

## Phase 1: Database Schema & Security Refactor
Goal: Implement the backend storage and RLS logic for profile privacy settings.

- [ ] Task: Create a migration adding a `privacy_level` column to the `profiles` table (enum: `public`, `friends_only`, `private`).
- [ ] Task: Refactor existing RLS policies on `profiles`, `visits`, and `favorites` to consolidate privacy checks and avoid redundant logic.
- [ ] Task: Update the `get_friend_activity_feed` and `get_friends_and_requests` RPCs to strictly respect privacy settings using optimized subquery patterns.
- [ ] Task: Write SQL unit tests to verify access for each privacy level across different friendship states.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Database Schema & Security Refactor' (Protocol in workflow.md)

## Phase 2: Store & Service Integration
Goal: Update the frontend stores and services to handle privacy settings and visibility logic.

- [ ] Task: Refactor `userStore.ts` and `friendStore.ts` to manage the new privacy state, ensuring it's hydrated correctly and synchronized with Supabase.
- [ ] Task: Update `ProfileService.ts` to support atomic privacy level updates.
- [ ] Task: Implement unit tests for privacy state transitions in the stores.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Store & Service Integration' (Protocol in workflow.md)

## Phase 3: Privacy Management UI
Goal: Build the interface for users to control their privacy settings.

- [ ] Task: Implement a streamlined "Privacy Settings" UI within the user settings section.
- [ ] Task: Update the UI to reflect the current privacy state and provide clear descriptions for each level.
- [ ] Task: Add unit tests for the privacy management components.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Privacy Management UI' (Protocol in workflow.md)

## Phase 4: Social Visibility & E2E Validation
Goal: Gracefully handle restricted profile content across the application.

- [ ] Task: Implement a comprehensive E2E privacy test suite using the centralized `e2e/helpers.ts` for all user actions and navigation.
- [ ] Task: Refactor `FriendProfile.tsx` and `FriendActivityFeed.tsx` to handle restricted visibility gracefully, removing any redundant client-side filtering.
- [ ] Task: Verify that map markers and social summaries correctly respect privacy across both Desktop and Mobile viewports.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Social Visibility & E2E Validation' (Protocol in workflow.md)
