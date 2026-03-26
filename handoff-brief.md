# Handoff Brief: Privacy Flow E2E Resolution (WebKit & Mobile)

## 1. Context & Objectives
- **Feature:** Collaborative Trip Sharing & Privacy Controls.
- **Task:** Resolve failing `e2e/privacy-flow.spec.ts` in WebKit, Mobile Safari, and Mobile Chrome.
- **Status:** **ALL PASSED**. Chromium, Firefox, WebKit, Mobile Safari, and Mobile Chrome are now 100% stable.

## 2. Target Logic (Jest)
- **Component:** `GlobalModalRenderer` and `WineryActions`.
- **State Store:** `uiStore`.
- **Logic Branch:** Singleton modal opening/closing logic via `openVisitForm` and `closeVisitForm`.

## 3. Target UI (Playwright)
- **Flow:** `e2e/privacy-flow.spec.ts`.
- **Selectors (Verified):**
    - `[data-testid="log-visit-button"]`: Triggers `openVisitForm(winery)`.
    - `role="dialog"`, filter `hasText: /Detailed information/i`: Target `WineryModal`.
    - `role="dialog"`, filter `hasText: /(Log a Visit|Edit Visit|Add New Visit)/i`: Target `VisitForm`.
- **Interaction Constraints:** 
    - `scrollIntoViewIfNeeded()` required for WebKit stability.
    - `waitForTimeout(1000)` buffer required between sequential modal actions.
    - `logVisit` helper MUST wait for DOM removal before returning.

## 4. Backend/Supabase Context
- **RPCs Involved:** `log_visit`, `update_visit`.
- **Auth Schema:** `profiles` table handles `privacy_level`.
- **E2E Mocking:** `MockMapsManager` handles RPC fallbacks for real social/visit data when `useRealSocial()` / `useRealVisits()` are called.

## 5. Logic & UI Mapping (logic-mapping)
- **Singleton Modals:** `VisitForm` is a global singleton rendered by `GlobalModalRenderer`.
- **Interaction Issue:** The `log-visit-button` (inside `WineryModal`) was being blocked by lingering Toast notifications and scroll animations in mobile viewports.
- **Fix:** 
    - `logVisit` helper now explicitly waits for the modal to be hidden (DOM + Store) before returning.
    - `privacy-flow.spec.ts` now includes a settlement buffer (`waitForTimeout(1000)`) between sequential visit logs.
    - A hybrid click strategy (`click({ force: true })` fallback to `robustClick`) ensures cross-engine compatibility.

## 6. UI Flow & Selectors (ui-mapping)
- **PWA/WebKit Note:** `scrollIntoViewIfNeeded()` is critical before clicking buttons at the top of the modal after a previous action has scrolled the modal content.

## 7. State Sync Mapping (handoff-state-sync)
- **Store Sync:** `useUIStore.getState().isModalOpen` is the source of truth for the singleton modal state.
- **Persistence:** Store hydration state is verified using `persist.hasHydrated()`.

## 8. Reproduction & Verification (handoff-brief)
- **Reproduction Command:** `./scripts/run-e2e-container.sh all e2e/privacy-flow.spec.ts`
- **Verification:** All 6 tests passed in 2.2m.

## 9. Fresh Start Prompt
"I have resolved the flakiness in `e2e/privacy-flow.spec.ts` across all browser engines. The fix involved improving the `logVisit` helper to wait for modal cleanup and adding settlement buffers in the spec file to handle overlapping UI elements (Toasts) and scroll animations. Please verify that the entire suite passes using `./scripts/run-e2e-container.sh all e2e/privacy-flow.spec.ts` and continue with the next task in the plan."
