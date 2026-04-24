---
name: project-testing-best-practices
description: Use this skill to design, implement, and verify tests. It enforces Senior-level architectural purity, favoring store-state injection and feature isolation over navigation-heavy E2E chains.
license: MIT
metadata:
  author: Gemini CLI
  version: "2.0.0"
  date: March 2026
  scope: testing-verification
  complexity: high
  dependencies: [handoff-protocol, chrome-devtools-mcp, playwright-mcp]
  abstract: Defines the "Atomic Verification" standard. This skill prioritizes State-Injection (injecting data via stores) to bypass fragile navigation, enforces Portal-based modal encapsulation, and mandates Type-Safe mocking to eliminate regression loops.
---

# Project Testing Best Practices (v2.0 - Senior Standard)

These standards move the project from "Defensive Survivability" to "Architectural Purity."

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | State Injection | CRITICAL | `pw-state-injection` |
| 2 | Portal Encapsulation | CRITICAL | `pw-portal-encapsulation` |
| 3 | Schema Integrity | CRITICAL | `pw-mocking` |
| 4 | Pragmatic Troubleshooting | HIGH | `pw-pragmatic-troubleshooting` |
| 5 | Stable Diagnostics | HIGH | `pw-diagnostics` |
| 6 | Pure Jest Patterns | HIGH | `jest-patterns` |
| 7 | WebKit Stability | HIGH | `pw-webkit-stability` |
| 8 | Accessibility (Axe) | MEDIUM | `pw-accessibility` |
| 9 | Collaborative Sync | MEDIUM | `pw-collaborative-sync` |

## Success Criteria

1. **Atomic Speed:** Full feature tests (e.g., Trip Sharing) MUST run in under 15 seconds by bypassing navigation via `page.evaluate` state injection.
2. **Pure Components:** Unit tests for UI components (Cards, Modals) MUST require zero store mocks; data is passed via raw JSON props.
3. **Synchronous Guards:** Mutating handlers (like `handleSave`) MUST use a `useRef` guard to prevent duplicate submissions from rapid synthetic events.
4. **Pragmatic Confidence:** AI Agents MUST NOT spend more than 2 turns on a single-engine UI race condition. If logic passes in Atomic (Tier 2) tests, the agent is authorized to skip the engine for the UI flow.
5. **Modal Closure Retry:** E2E closure helpers MUST retry the close action (click/Escape) inside a `toPass` block that verifies the Store state (`isOpen === false`). Fallback to `page.keyboard.press('Escape')` if the button is unclickable.
6. **Schema Enforcement:** 100% of mocks in `MockMapsManager` MUST be typed using `lib/database.types.ts`.
7. **Standard Interaction:** The project standard is Playwright's native `.click()` for all interactions. Use `{ force: true }` if an element is temporarily covered by a toast, or encapsulate actions in `toPass` retry blocks for timing issues. **NEVER** use `robustClick` or manual event dispatching.
8. **Submission Gate:** E2E helpers MUST NOT click a submission button if the store's saving state is true. Verification of the `isSaving` state is a mandatory prerequisite.
9. **Portal Architecture:** All feature modals MUST be encapsulated within the feature using React Portals to `#modal-root`. `GlobalModalRenderer` is strictly for generic `modalContent`.
10. **Zero-Guess Debugging:** All failures follow the "Mandatory Diagnostic Protocol" before any fix is attempted.
11. **Hydration Optimization:** Data arrays (`trips`, `visits`, etc.) MUST be unpersisted to eliminate hydration bottlenecks. Verification MUST confirm `localStorage` remains < 1KB.
12. **Local Database Verification:** Feature logic MUST be verified against the **Local Supabase Stack** using Tier 3 (Real Data) E2E tests before finalization. This ensures RLS policies and RPC schemas are correct beyond mock-level assumptions.
13. **IDB Robustness:** E2E tests inspecting local persistence MUST use the project's exposed `idbKeyVal` instance rather than raw `indexedDB.open()`. Raw IDB requests in `page.evaluate` are prone to deadlocks in containerized environments.
14. **Offline Reload Protocol:** `page.reload()` MUST NOT be called while `context.setOffline(true)` is active in infrastructure tests unless testing the SW offline fallback specifically. Restore connectivity before reloads to ensure a stable hydration environment.
