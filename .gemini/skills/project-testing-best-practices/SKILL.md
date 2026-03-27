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
3. **Zero RobustPatching:** `robustClick()` is FORBIDDEN. Standard Playwright `.click()` must work; if it fails, the underlying hydration/visibility logic must be fixed.
4. **Schema Enforcement:** 100% of mocks in `MockMapsManager` MUST be typed using `lib/database.types.ts`.
5. **Portal Isolation:** Modals are tested in their local feature context, not via a global singleton renderer.
6. **Zero-Guess Debugging:** All failures follow the "Mandatory Diagnostic Protocol" before any fix is attempted.
