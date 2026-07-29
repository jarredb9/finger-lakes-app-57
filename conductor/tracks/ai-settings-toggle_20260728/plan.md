# Implementation Plan - User Preference for AI Features (Opt-In / Default OFF)

This plan outlines the TDD-driven tasks for implementing the AI features toggle setting, defaulting to OFF, hiding AI components when disabled, and establishing an extensible AI capability system.

## Phase 1: Database Migration & Core State Infrastructure [checkpoint: 06a69bb]
- [x] Task: Create database migration for `ai_enabled` column on user profiles (default `false`) b6b1805
- [x] Task: Update `User` interface & `userStore` to support `ai_enabled` state and offline-friendly sync (`updateAIEnabled`) 52e4cd3
- [x] Task: Create extensible `useAIFeaturesEnabled()` hook / helper for component AI feature checks 25dbe65
- [x] Task: Conductor - User Manual Verification 'Phase 1: Database Migration & Core State Infrastructure' (Protocol in workflow.md) 06a69bb

## Phase 2: Settings UI & User Opt-in Toggle [checkpoint: 971e698]
- [x] Task: Build `AISettings` component with toggle switch (default OFF) and descriptive opt-in copy 5098819
- [x] Task: Integrate `AISettings` into `app/settings/page.tsx` da52081
- [x] Task: Conductor - User Manual Verification 'Phase 2: Settings UI & User Opt-in Toggle' (Protocol in workflow.md) 971e698

## Phase 3: Conditional AI Insights in Winery Modal & Varietals Tab [checkpoint: 8533c77]
- [x] Task: Update `components/winery-modal.tsx` to conditionally render "AI Insights" tab (mobile & desktop) based on AI feature state, with tab fallback to "Community" 8600c02
- [x] Task: Update `components/WineryVarietalsTab.tsx` to conditionally hide AI tasting insights when AI features are OFF 8600c02
- [x] Task: Conductor - User Manual Verification 'Phase 3: Conditional AI Insights in Winery Modal & Varietals Tab' (Protocol in workflow.md) 8533c77

## Phase 4: E2E Verification & Test Suite Updates [checkpoint: d0fd30d]
- [x] Task: Update existing E2E tests (e.g. `e2e/winery-modal.spec.ts`) to test both default OFF state (verifying tab absence) and opted-in ON state (verifying tab presence & interaction) 7652ad9
- [x] Task: Create new Playwright E2E test covering Settings page AI toggle interaction and persistence across page reloads 7652ad9
- [x] Task: Update Jest unit tests for `userStore` and presentational components to cover `ai_enabled` state 7652ad9
- [x] Task: Conductor - User Manual Verification 'Phase 4: E2E Verification & Test Suite Updates' (Protocol in workflow.md) d0fd30d

## Phase 5: Review Fixes
- [x] Task: Apply review suggestions 4a9c8e0


