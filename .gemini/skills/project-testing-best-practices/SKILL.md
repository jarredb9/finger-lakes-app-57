---
name: project-testing-best-practices
description: ACTIVATE THIS SKILL if the user mentions: 'Testing', 'E2E', 'Playwright', 'Jest', 'Mock', 'Toast', 'Modal', 'Handoff', 'Bug', 'Regression', 'Axe', or 'A11y'.
license: MIT
metadata:
  author: Gemini CLI
  version: "2.1.0"
  date: May 2026
  scope: testing-verification
  complexity: high
  dependencies: [handoff-protocol, chrome-devtools-mcp, playwright-mcp]
  abstract: Defines the "Atomic Verification" standard. This skill prioritizes State-Injection to bypass fragile navigation, enforces Portal-based modal encapsulation, and mandates the Mandatory Diagnostic Protocol for 5x faster root-cause analysis.
---

# Project Testing Best Practices (v2.1.1 - Senior Standard)

These standards move the project from "Defensive Survivability" to "Architectural Purity."

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Mandatory Diagnostics | CRITICAL | `pw-diagnostics` |
| 2 | State Injection | CRITICAL | `pw-state-injection` |
| 3 | Portal Encapsulation | CRITICAL | `pw-portal-encapsulation` |
| 4 | Schema Integrity | CRITICAL | `pw-mocking` |
| 5 | Stable Interactions | HIGH | `pw-interactions` |
| 6 | Pure Jest Patterns | HIGH | `jest-patterns` |
| 7 | WebKit Stability | HIGH | `pw-webkit-stability` |
| 8 | Accessibility (Axe) | MEDIUM | `pw-accessibility` |
| 9 | Collaborative Sync | MEDIUM | `pw-collaborative-sync` |

## Success Criteria

1. **Atomic Speed:** Full feature tests (e.g., Trip Sharing) MUST run in under 15 seconds by bypassing navigation via `page.evaluate` state injection.
2. **The 3-Tier Sequence:** NEVER fix a test based on assumptions. Follow: DOM -> Store -> DB (see `references/pw-diagnostics.md`).
3. **Pure Components:** Unit tests for UI components (Cards, Modals) MUST require zero store mocks; data is passed via raw JSON props.
4. **Synchronous Guards:** Mutating handlers (like `handleSave`) MUST use a `useRef` guard to prevent duplicate submissions from rapid synthetic events.
5. **Pragmatic Confidence:** AI Agents MUST NOT spend more than 2 turns on a single-engine UI race condition. If logic passes in Atomic (Tier 2) tests, skip the engine.
6. **Modal Closure Retry:** E2E closure helpers MUST retry the close action (click/Escape) inside a `toPass` block that verifies the Store state (`isOpen === false`).
7. **Schema Enforcement:** 100% of mocks in `MockMapsManager` MUST be typed using `lib/database.types.ts`.
8. **Standard Interaction:** Use Playwright's native `.click()`. Use `{ force: true }` if needed. **NEVER** use `robustClick` or manual event dispatching.
9. **Readiness Gate:** Feature modals MUST implement `data-state="ready"` attribute once initial data fetching is complete.
10. **Submission Gate:** E2E helpers MUST NOT click a submission button if the store's `isSaving` state is true. Verification is a mandatory prerequisite.
11. **Hydration Optimization:** Data arrays (`trips`, `visits`, etc.) MUST be unpersisted to eliminate hydration bottlenecks. `localStorage` MUST remain < 1KB.
12. **Handoff Protocol:** Implementation agents MUST activate `handoff-protocol` before concluding. Use `scripts/validate-brief.py` for verification.
13. **Security Compliance:** `npm run db:lint` MUST pass before merging migrations. `window.matchMedia` MUST be polyfilled in `jest.setup.ts`.
14. **Mutation Settlement:** ALWAYS verify the appearance of the success toast using `waitForToast` before proceeding to the next interaction.
