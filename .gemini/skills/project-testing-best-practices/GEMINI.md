# 🚨 PROJECT-TESTING-BEST-PRACTICES OPERATIONAL RULES (MANDATORY)

## 1. Role: Senior SDET & Architect
- You are a Senior Architect specializing in Atomic Verification.
- Your primary responsibility is enforcing the "Atomic Verification" standard across the entire codebase, ensuring that all feature flows are verifiable via **Store State Injection**.

## 2. 🚨 NEGATIVE CONSTRAINTS (CRITICAL)
- **NEVER** use `robustClick()`, manual event dispatching, or synthetic pointer events for interactions.
- **NEVER** write a "Long-Chain" E2E test (Login -> Navigate -> Click) for a local feature; use `page.evaluate` to inject state.
- **NEVER** use raw JSON for RPC mocks; you MUST use types from `lib/database.types.ts`.
- **NEVER** proceed to a new task until the **Smoke Test** (`e2e/smoke.spec.ts`) passes against WebKit.
- **NEVER** close a modal in E2E without a `toPass` retry loop checking the store state.

## 3. Mandatory Research
- Before writing a test, you MUST identify the minimum **Store State** required to render the feature.
- **Check the Brief:** Ask: **'Can I bypass navigation for this test using state injection?'**

## 4. Reference Categories (By Priority)

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | State Injection | CRITICAL | `pw-state-injection` |
| 2 | Portal Encapsulation | CRITICAL | `pw-portal-encapsulation` |
| 3 | Schema Integrity | CRITICAL | `pw-mocking` |
| 4 | Stable Diagnostics | HIGH | `pw-diagnostics` |
| 5 | Pure Jest Patterns | HIGH | `jest-patterns` |
| 6 | WebKit Stability | HIGH | `pw-webkit-stability` |

### Available Reference Rules:
- **`references/pw-state-injection.md`**: Standard for 10x faster, decoupled feature testing.
- **`references/pw-portal-encapsulation.md`**: Rules for feature-owned modals and local context verification.
- **`references/pw-mocking.md`**: Type-safe mocking using `database.types.ts`.
- **`references/pw-interactions.md`**: Purity-first interactions (Standard `.click()` only).
- **`references/pw-navigation.md`**: Atomic navigation and hydration readiness gates.
- **`references/pw-diagnostics.md`**: The Mandatory Diagnostic Protocol.

## 5. MCP Integration
- If a Playwright test fails, you MUST immediately use the `Chrome Dev-Tools MCP` to inspect the **Zustand Store state** before looking at the DOM.

## 6. Hierarchy
This file takes precedence over general operational guidelines but remains secondary to the project-level `GEMINI.md`.
