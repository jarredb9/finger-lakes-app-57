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
| 4 | Stable Diagnostics | HIGH | `pw-diagnostics` |
| 5 | Pure Jest Patterns | HIGH | `jest-patterns` |
| 6 | WebKit Stability | HIGH | `pw-webkit-stability` |
| 7 | Accessibility (Axe) | MEDIUM | `pw-accessibility` |
| 8 | Collaborative Sync | MEDIUM | `pw-collaborative-sync` |

## Success Criteria

1. **Atomic Speed:** Full feature tests (e.g., Trip Sharing) MUST run in under 15 seconds by bypassing navigation via `page.evaluate` state injection.
2. **Pure Components:** Unit tests for UI components (Cards, Modals) MUST require zero store mocks; data is passed via raw JSON props.
3. **Synchronous Guards:** Mutating handlers (like `handleSave`) MUST use a `useRef` guard to prevent duplicate submissions from rapid synthetic events.
4. **Modal Closure Retry:** E2E closure helpers MUST retry the close action (click/Escape) inside a `toPass` block that verifies the Store state (`isOpen === false`). Fallback to `page.keyboard.press('Escape')` if the button is unclickable.
5. **Schema Enforcement:** 100% of mocks in `MockMapsManager` MUST be typed using `lib/database.types.ts`.
6. **Robust Interaction:** The "Hybrid Click" strategy (Standard click + `robustClick` retry) is the project standard for WebKit reliability. Standard `.click()` is preferred ONLY for non-complex primitives in Chromium.
7. **Submission Gate:** E2E helpers MUST NOT click a submission button if the store's saving state is true. Verification of the `isSaving` state is a mandatory prerequisite.
8. **Portal Transition:** While `GlobalModalRenderer` is the current implementation, new features should aim for local feature-owned Portals.
9. **Zero-Guess Debugging:** All failures follow the "Mandatory Diagnostic Protocol" before any fix is attempted.
