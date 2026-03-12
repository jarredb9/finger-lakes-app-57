---
name: handoff-protocol
description: Use this skill when you have completed a feature implementation or major refactor and need to prepare a "Fresh Start Prompt" for a testing agent. This skill enforces 100% logic branch mapping and UI flow verification before session termination.
license: MIT
metadata:
  author: Gemini CLI
  version: "1.3.0"
  date: March 2026
  scope: session-handoff
  complexity: high
  dependencies: [project-testing-best-practices, supabase-mcp, chrome-devtools-mcp]
  abstract: Defines the '100% Coverage Readiness' protocol. Requires mapping of all logic branches for Jest and UI flows for Playwright, culminating in a 'Fresh Start Prompt' for execution.
---

# Handoff Protocol: 100% Coverage Readiness

This protocol ensures that every feature implementation is perfectly prepared for a follow-up testing and verification session, preventing context degradation and hallucinated selectors.

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Logic Branch Mapping | HIGH | `logic-mapping` |
| 2 | UI Flow & Selectors | CRITICAL | `ui-mapping` |
| 3 | State Sync Mapping | CRITICAL | `handoff-state-sync` |
| 4 | Backend & Security | CRITICAL | `backend-context` |
| 5 | ID & Data Mapping | HIGH | `id-mapping` |
| 6 | Fresh Start Template | CRITICAL | `handoff-brief` |

## Success Criteria

1. **Deterministic Handoff:** The next agent knows exactly which file paths and logic branches to test.
2. **Zero-Hallucination Selectors:** Every selector is verified via `Chrome Dev-Tools MCP`.
3. **PWA Aware:** The brief identifies Base64/Binary requirements for Safari/WebKit.
4. **ID System Safety:** The brief clearly distinguishes between Google and Supabase IDs.
5. **Security Definer Awareness:** All RPC security contexts are documented.
