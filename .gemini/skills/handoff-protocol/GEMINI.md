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

## 5. Reference Categories (By Priority)

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Logic Branch Mapping | HIGH | `logic-mapping` |
| 2 | UI Flow & Selectors | CRITICAL | `ui-mapping` |
| 3 | State Sync Mapping | CRITICAL | `handoff-state-sync` |
| 4 | Backend & Security | CRITICAL | `backend-context` |
| 5 | ID & Data Mapping | HIGH | `id-mapping` |
| 6 | Fresh Start Template | CRITICAL | `handoff-brief` |

### Available Reference Rules:
- **`references/logic-mapping.md`**: Guide for 100% Jest readiness.
- **`references/ui-mapping.md`**: Singleton modal logic and WebKit binary data requirements.
- **`references/handoff-state-sync.md`**: Mapping store refreshes and "Merge on Hydrate" patterns.
- **`references/backend-context.md`**: Supabase RPC search paths and visibility tiers.
- **`references/id-mapping.md`**: Explicit mapping of Google (string) vs. Supabase (number) IDs.
- **`references/handoff-brief.md`**: The mandatory Fresh Start Prompt template.

## 6. Validation (Self-Audit)
- Before concluding, you MUST run the `scripts/validate-brief.py` on your generated brief.

## 7. 🛠️ SKILL MAINTENANCE PROTOCOL
- **Trigger:** If you find yourself explaining a new architectural concept (e.g., a new "Thick Client" pattern) to a user during a handoff, you MUST codify it.
- **Action:** Add a new reference file or update `handoff-brief.md` to include the new requirement.
- **Constraint:** Maintain the **"Master Level"** depth; briefs must allow a fresh agent to work without `read_file` exploration.

## 8. Hierarchy
This file takes precedence over general operational guidelines but remains secondary to the project-level `GEMINI.md`.
