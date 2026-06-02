---
name: project-testing-best-practices
description: ACTIVATE THIS SKILL if the user mentions: 'Testing', 'E2E', 'Playwright', 'Jest', 'Mock', 'Toast', 'Modal', 'Handoff', 'Bug', 'Regression', 'Axe', 'A11y', or 'Deno'.
---

# 🚨 PROJECT-TESTING-BEST-PRACTICES OPERATIONAL RULES (MANDATORY)

## 0. Efficiency Directive (PRIORITY 0)
- **Identity:** If you are a sub-agent, you are the terminal **DELEGATE**.
- **Terminality:** Sub-agents are forbidden from using `invoke_agent`.
- **Parallel Discovery:** You MUST use parallel tool calls for file reads/searches.
- **Verification Sandbox:** You are permitted to use `write_file` ONLY for temporary files (e.g., `temp_fix.ts`).
- **Circuit Breaker:** If the same error occurs twice, STOP and report "Strategy Exhausted."
- **Diagnostic Signal:** All failures MUST include: [BLOCKER], [HYPOTHESIS], and [ACTION]. Failures MUST also provide:
    - **Zustand Store Dump:** (via `page.evaluate(() => useStore.getState())`)
    - **Network Trace:** (Summary of failed RPCs/APIs from logs)
- **Build Limit:** Never use the `--build` flag if a build has already occurred in the parent session.
- **Acknowledge:** Your first turn MUST state: "I have read and will obey the Efficiency Directive as the terminal DELEGATE."

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

# Project Testing Best Practices (v2.1.2 - Senior Standard)

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
| 10 | Edge Functions (Deno) | HIGH | `deno-patterns` |

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
15. **Edge Function Purity:** Edge functions MUST export their `handler` for local unit testing via Deno. Tests must mock `Deno.env` and external `fetch` calls (see `references/deno-patterns.md`).

## MCP Integration
- If a Playwright test fails, you MUST immediately use the `Chrome Dev-Tools MCP` to inspect the **Zustand Store state** before looking at the DOM.

### 11. Local Stack Verification (Tier 3)
When moving from mocks (Tier 2) to Real Data verification (Tier 3), you MUST use the **Local Supabase Stack**.
- **Standard:** Use `./scripts/run-e2e-container.sh --build all ...` to ensure the container build picks up local environment variables.
- **Pre-requisite:** ALWAYS run `npm run db:populate` to ensure the local DB has enriched data.
- **Verification:** Monitor diagnostic logs for `[NETWORK-REQ]` to confirm the URL is `http://127.0.0.1:54321`.
- **Targeting Rule:** 
    - **Local:** Targets local Supabase (`127.0.0.1:54321`).
    - **GitHub CI:** Targets Live Database (`supabase.co`) using secrets.
- **Action:** If a Tier 3 test fails locally but logic seems correct, verify the local database schema matches `lib/database.types.ts` using Supabase MCP tools.
