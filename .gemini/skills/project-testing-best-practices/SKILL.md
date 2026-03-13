---
name: project-testing-best-practices
description: Use this skill when the user asks to write new tests, fix failing tests, or audit code coverage. This skill enforces 100% dual-layer coverage (Jest/Playwright) and WebKit/Safari stability patterns.
license: MIT
metadata:
  author: Gemini CLI
  version: "1.3.0"
  date: March 2026
  scope: testing-verification
  complexity: high
  dependencies: [handoff-protocol, chrome-devtools-mcp, playwright-mcp]
  abstract: Defines dual-layer 100% coverage standards for the Winery Visit Planner. This skill is optimized for agents and provides specific rules for Jest unit tests and Playwright E2E tests, particularly in fragile environments like WebKit/Safari and offline/PWA states.
---

# Project Testing Best Practices

These standards ensure the reliability and stability of the application across offline, PWA, and Safari/WebKit environments.

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Stable Navigation | CRITICAL | `pw-navigation` |
| 2 | Stable Diagnostics | CRITICAL | `pw-diagnostics` |
| 3 | WebKit Stability | CRITICAL | `pw-webkit-stability` |
| 4 | Collaborative Testing | HIGH | `pw-collaborative-sync` |
| 5 | Accessibility (Axe) | HIGH | `pw-accessibility` |
| 6 | Visual Stability | MEDIUM | `pw-visual-stability` |
| 7 | Robust Layout | HIGH | `pw-layout-stability` |
| 8 | Singleton Modals | HIGH | `pw-singleton-modals` |
| 9 | Robust Interactions | HIGH | `pw-interactions` |
| 10 | Multi-Context Mocking | HIGH | `pw-mocking` |
| 11 | Jest Patterns | HIGH | `jest-patterns` |

## Success Criteria

1. **100% Branch Coverage** in Jest for business logic.
2. **100% Flow Coverage** in Playwright for critical UI paths.
3. **No Brittle Clicks:** Standard Playwright `click()` is avoided in favor of `robustClick()`.
4. **Stable Navigation:** All navigation uses `navigateToTab()` or `waitForAppReady()`.
5. **No Data Loss:** Photo uploads follow the "Reconstitution Rule" for Safari/WebKit.
6. **Zero-Guess Debugging:** All test failures are analyzed using the "Mandatory Diagnostic Protocol."
