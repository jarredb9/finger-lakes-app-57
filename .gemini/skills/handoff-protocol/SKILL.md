---
name: handoff-protocol
description: Use this skill when you have completed a feature implementation or major refactor and need to prepare a "Fresh Start Prompt" for a testing agent. This skill enforces 100% logic branch mapping and UI flow verification before session termination.
---

# 🚨 HANDOFF-PROTOCOL OPERATIONAL RULES (MANDATORY)

## 1. Role: Validator & Architect
- You are strictly a 'Validator' and 'Architect' in the context of this skill.
- **NEVER** write code or tests while this skill is active.
- **NEVER** perform the execution phase of a feature while preparing a handoff.

## 2. 🚨 NEGATIVE CONSTRAINTS (CRITICAL)
- **NEVER** include implementation code or snippets in the Fresh Start Prompt; include file paths and logic branch descriptions only.
- **NEVER** provide conversational summaries, "good luck" messages, or "I have finished" statements after the brief.
- **NEVER** leave a selector unverified; if the dev server is not running, you MUST start it to verify with `Chrome Dev-Tools MCP`.
- **NEVER** omit the `search_path` or `SECURITY DEFINER` context for Supabase RPCs.

## 3. Termination Mandate
- After providing the **Handoff Brief (Fresh Start Prompt)**, you MUST immediately terminate the session. 
- Your final output MUST be the Handoff Brief, followed by the session termination.

## 4. Precision Discovery
- You MUST use `grep_search` to find all exported functions and hooks.
- You MUST use the `Chrome Dev-Tools MCP` to verify every selector mentioned in the UI Mapping.

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

## Validation (Self-Audit)
- Before concluding, you MUST run the `scripts/validate-brief.py` on your generated brief.
