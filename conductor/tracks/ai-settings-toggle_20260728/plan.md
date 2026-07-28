# Implementation Plan - User Preference for AI Features (Opt-In / Default OFF)

This plan outlines the TDD-driven tasks for implementing the AI features toggle setting, defaulting to OFF, hiding AI components when disabled, and establishing an extensible AI capability system.

## Phase 1: Database Migration & Core State Infrastructure
- [ ] Task: Create database migration for `ai_enabled` column on user profiles (default `false`)
- [ ] Task: Update `User` interface & `userStore` to support `ai_enabled` state and offline-friendly sync (`updateAIEnabled`)
- [ ] Task: Create extensible `useAIFeaturesEnabled()` hook / helper for component AI feature checks
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Database Migration & Core State Infrastructure' (Protocol in workflow.md)

## Phase 2: Settings UI & User Opt-in Toggle
- [ ] Task: Build `AISettings` component with toggle switch (default OFF) and descriptive opt-in copy
- [ ] Task: Integrate `AISettings` into `app/settings/page.tsx`
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Settings UI & User Opt-in Toggle' (Protocol in workflow.md)

## Phase 3: Conditional AI Insights in Winery Modal & Varietals Tab
- [ ] Task: Update `components/winery-modal.tsx` to conditionally render "AI Insights" tab (mobile & desktop) based on AI feature state, with tab fallback to "Community"
- [ ] Task: Update `components/WineryVarietalsTab.tsx` to conditionally hide AI tasting insights when AI features are OFF
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Conditional AI Insights in Winery Modal & Varietals Tab' (Protocol in workflow.md)

## Phase 4: E2E Verification & Integration Testing
- [ ] Task: Create Playwright E2E test verifying default OFF behavior, settings toggle, and tab visibility updates in `winery-modal.tsx`
- [ ] Task: Conductor - User Manual Verification 'Phase 4: E2E Verification & Integration Testing' (Protocol in workflow.md)
