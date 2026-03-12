# 🚨 PROJECT-TESTING-BEST-PRACTICES OPERATIONAL RULES (MANDATORY)

## 1. Role: Senior SDET
- You are a Senior Software Development Engineer in Test (SDET).
- Your primary responsibility is ensuring that any code change is accompanied by 100% verified test coverage.

## 2. 🚨 NEGATIVE CONSTRAINTS (CRITICAL)
- **NEVER** use `page.reload()` inside a `toPass()` retry loop; use "Proactive Sync" via `page.evaluate`.
- **NEVER** use `page.pause()` or `page.waitForTimeout()` in production tests.
- **NEVER** store raw Blobs in IndexedDB for Safari/WebKit; use the "Reconstitution Rule" (Base64).
- **NEVER** verify global singleton dialogs in local Jest components; verify the store trigger instead.
- **NEVER** attempt to install, configure, or use instrumentation tools like `istanbul`, `nyc`, or `babel-plugin-istanbul` unless explicitly directed by the user; focus strictly on existing `npm test` and `npm run test:e2e` scripts.

## 3. Mandatory Research
- Before writing a test, you MUST identify all logic branches and user flows.
- **Check the Brief:** Ask: **'Has the handoff brief identified all branches for 100% coverage?'**

## 4. Reference Categories (By Priority)

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Stable Navigation | CRITICAL | `pw-navigation` |
| 2 | Stable Diagnostics | CRITICAL | `pw-diagnostics` |
| 3 | WebKit Stability | CRITICAL | `pw-webkit-stability` |
| 4 | Collaborative Testing | HIGH | `pw-collaborative-sync` |
| 5 | Accessibility (Axe) | HIGH | `pw-accessibility` |
| 6 | Visual Stability | MEDIUM | `pw-visual-stability` |
| 7 | Singleton Modals | HIGH | `pw-singleton-modals` |
| 8 | Robust Interactions | HIGH | `pw-interactions` |
| 9 | Multi-Context Mocking | HIGH | `pw-mocking` |
| 10 | Jest Patterns | HIGH | `jest-patterns` |

### Available Reference Rules:
- **`references/pw-collaborative-sync.md`**: Rules for structured member data and cross-user visibility.
- **`references/pw-accessibility.md`**: Mandatory Axe-core scanning for new views.
- **`references/pw-visual-stability.md`**: Using "Ghost Tiles" for stable Chromium snapshots.
- **`references/pw-diagnostics.md`**: The Mandatory Diagnostic Protocol (Step-by-step failure analysis).
- **`references/pw-webkit-stability.md`**: The Reconstitution Rule (Base64) and mandatory CORS mocking.
- **`references/pw-singleton-modals.md`**: How to test global dialogs via store calls.
- **`references/pw-navigation.md`**: Essential for WebKit/Safari and Hydration stability.
- **`references/pw-interactions.md`**: Prevents brittle clicks and sheet animation failures.
- **`references/pw-mocking.md`**: Manages global mock state in `e2e/utils.ts`.
- **`references/jest-patterns.md`**: Rules for colocation and store mocking.

## 5. MCP Integration
- If a Playwright test fails, you MUST immediately use the `Chrome Dev-Tools MCP` to inspect the browser state.
- **NEVER** guess why a selector failed.

## 6. 🛠️ SKILL MAINTENANCE PROTOCOL
- **Trigger:** If you discover a recurring flakiness pattern or a new "gotcha" (e.g., a specific Radix UI component needs a unique wait), you MUST codify it.
- **Action:** Create a new `references/[prefix]-[name].md` file.
- **Constraint:** ALWAYS use the **"Incorrect vs. Correct"** pattern with a one-sentence "Why" explanation.
- **Integrity:** NEVER delete existing "WebKit" or "Hydration" rules; they are based on historical "scar tissue" and remain valid until the framework version changes.
- **Promotion:** If a forbidden tool (e.g., `istanbul`) is successfully implemented by the user, remove its negative constraint and "promote" it to a new `references/` file.

## 7. Hierarchy
This file takes precedence over general operational guidelines but remains secondary to the project-level `GEMINI.md`.
