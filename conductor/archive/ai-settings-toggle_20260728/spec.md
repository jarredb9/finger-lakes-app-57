# Specification: User Preference for AI Features (Opt-In / Default OFF)

## Track Overview
Add a user setting option to enable or disable AI features across the application. The default setting will be OFF (`ai_enabled = false`), requiring users to explicitly opt into AI-powered insights and summaries. This setting will be stored in the user profile/userStore (persisted in database/offline queue), and checked globally via a dedicated utility hook (`useAIFeaturesEnabled()` or `userStore.user?.ai_enabled`).

When AI features are disabled:
- The "AI Insights" tab in the Winery Modal (`components/winery-modal.tsx`) is hidden on both desktop and mobile viewports.
- AI tasting insights and AI-generated content within the "Varietals" tab (`components/WineryVarietalsTab.tsx`) are hidden.
- If a user is viewing a tab that requires AI when AI features are turned off, navigation automatically falls back to the "Community" tab.
- Future AI features will check this central preference before rendering or triggering AI processing.

## Functional Requirements
1. **User Profile & Store Schema Updates**:
   - Add `ai_enabled` (boolean, default: `false`) field to user profile state and database schema / sync payload.
   - Default value for `ai_enabled` MUST be `false` (Opt-in model).
   - Provide an update action in `userStore` (`updateAIEnabled(enabled: boolean)`) supporting offline queuing (`enqueueIfOffline`).

2. **Settings UI**:
   - Add an "AI Features" section to the Settings page (`app/settings/page.tsx` / `components/AISettings.tsx`).
   - Render a switch toggle for "Enable AI Features" with descriptive text explaining that AI features (such as AI Insights and tasting notes) are optional and disabled by default.

3. **Global Extensible Check Utility / Hook**:
   - Provide a hook `useAIFeaturesEnabled()` (or store selector `useUserStore(state => state.user?.ai_enabled ?? false)`) for clean conditional rendering of AI features across any presentational component.

4. **Winery Modal (`components/winery-modal.tsx`) Updates**:
   - Hide the "AI Insights" tab trigger and content on both mobile and desktop layouts when `ai_enabled` is `false`.
   - If active tab is `"ai_insights"` and AI features are turned off, fall back to `"community"`.

6. **Test Suite Updates**:
   - Update existing E2E specs (such as `e2e/winery-modal.spec.ts`) to account for default OFF state (`ai_enabled: false`) and inject `ai_enabled: true` when testing AI Insights tab features.
   - Add new E2E and Jest unit test cases to explicitly test both ON and OFF states for AI capabilities.

## Non-Functional & Architectural Requirements
- **Backwards Compatibility**: Migration for `ai_enabled` column on profiles table (or profile update helper) must default to `false` and avoid breaking existing users.
- **Offline Resilience**: Profile preference updates must route through `enqueueIfOffline` sync utilities.
- **Zero AI API calls when OFF**: When `ai_enabled` is `false`, client components must not invoke AI Edge Functions or fetch AI summaries.

## Acceptance Criteria
- [ ] User Settings page displays an "AI Features" toggle switch, defaulting to OFF (`false`).
- [ ] Toggling the setting updates `userStore` and persists to Supabase backend / offline queue.
- [ ] When AI features are OFF:
  - "AI Insights" tab does NOT appear in `winery-modal.tsx` (mobile or desktop).
  - AI tasting insights sections are hidden in the "Varietals" tab.
  - No unnecessary background AI network requests are initiated.
- [ ] When AI features are turned ON in Settings:
  - "AI Insights" tab appears in `winery-modal.tsx`.
  - AI tasting insights in "Varietals" tab are rendered.
- [ ] Automated E2E test confirms toggle behavior, UI tab visibility, and default OFF state.

## Out of Scope
- Granular per-feature AI toggles (single master toggle is used).
- Third-party AI model customization.
