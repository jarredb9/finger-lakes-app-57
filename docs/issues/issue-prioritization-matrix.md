# GitHub Issue Prioritization & Rack-and-Stack Matrix

**Repository:** `jarredb9/finger-lakes-app-57`  
**Date:** October 23, 2026  
**Author:** Staff Software Engineer & Architect  
**Active Milestones:**
- `v3.7.1 - Security Hardening & Production Defense` (Active Next Priority / 9 open issues: #97, #87, #93, #94, #73, #75, #95, #96, #88)
- `v3.8.0 - Component Decomposition & UI Modernization` (10 open issues: #52, #41, #31, #50, #92, #89, #47, #74, #61, #55)
- `v3.9.0 - Platform Feature Expansions` (3 open issues: #34, #32, #13)
- `v3.10.0 - Social Discovery & Recommendation Platform` (Backlog / 3 open issues: #46, #45, #48)
- `Tooling: agent-resolve Engine & Developer Experience` (Developer Infrastructure / 4 open issues: #77, #84, #85, #86)
- `v3.7.0 - Bug Fixes, Incomplete Implementations, and PWA Testing Updates` (Complete / Ready for Release Tag: 0 open, 9 closed)

---

## 1. Prioritization Framework

Issues are ranked by balancing user impact, data integrity risk, architectural dependencies, security perimeter defense, and milestone alignment:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Tier 1: Production Integrity, Secrets & Database/Edge Security (P0)    │
│ CI runner sandbox escapes, production DB credentials in PRs (#97),     │
│ database RLS & schema lockdown (#87, #93), private data isolation &   │
│ Edge Function caller auth (#94), and client cache poisoning (#73, #75).│
├────────────────────────────────────────────────────────────────────────┤
│ Tier 2: Broken Core User Flows, Web & Client Perimeter Hardening (P1)  │
│ Dead-end 404s on winery share URLs (#41), open redirects & reset host  │
│ header poisoning (#95), client render crash DoS & offline DLQ plaintext│
│ persistence across logouts (#96), leaked password checks (#88).        │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 3: Core UX Enablers & Milestone v3.8.0 Alignment                 │
│ Primary planning friction (#50), map layout overlays (#89, #92),       │
│ and active milestone deliverables.                                     │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 4: Foundational Architecture & Technical Debt                    │
│ Unblocked schema contractions, dead-code removal, type hardening.     │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 5: Strategic Platform Capabilities (Milestone v3.9.0)            │
│ Major platform features (Google OAuth, winery lifecycle, PostGIS).     │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 6: Long-term Social & Discovery Backlog (Milestone v3.10.0)       │
│ Features requiring community density and social network scale.         │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 7: Autonomous Developer Tooling & Pipeline Infrastructure         │
│ agent-resolve engine modularization, token economics, and skills.      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Master Ranked Stack

| Rank | Issue | Type | Milestone | Execution Mode | Strategic Summary |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **1** | [#97: close agent Docker sandbox escape via Husky pre-commit, restrict production secrets in CI, and harden workflows](https://github.com/jarredb9/finger-lakes-app-57/issues/97) | Security / CI | `v3.7.1` | `ready-for-agent` | **Critical Pipeline & Credential Security:** Closes Docker sandbox escape in `agent-resolve` where Husky `pre-commit` hooks run un-sandboxed on the host runner with `GEMINI_API_KEY` and write-enabled `GH_TOKEN`. Removes production `SUPABASE_DB_URL` from untrusted `pull_request` builds, sanitizes environment variables, and hardens CI workflows against expression injection. |
| **2** | [#87: harden RLS, revoke anon & pg_graphql exposure, drop legacy RPCs, and default RPCs to SECURITY INVOKER](https://github.com/jarredb9/finger-lakes-app-57/issues/87) | Security / DB | `v3.7.1` | `ready-for-agent` | **Critical Security & Production Integrity:** Resolves 97 Supabase security linter warnings. Revokes `anon`/`authenticated` default schema privileges, restricts `anon` table access, defaults RPCs to `SECURITY INVOKER`, prevents unauthenticated catalog overwrites, isolates cross-user idempotency keys, and disables `pg_graphql` (ADR-0007). |
| **3** | [#93: harden PostgREST direct table RLS, storage policies, trip/friend membership validation, and webhook GUC priority](https://github.com/jarredb9/finger-lakes-app-57/issues/93) | Security / DB | `v3.7.1` | `ready-for-agent` | **Critical Database & Storage Access Control:** Patches direct PostgREST RLS bypasses. Enforces bilateral consent on `public.friends` (prevents unilateral friend acceptance), sets `public = false` on `visit-photos` storage bucket, restricts `profiles.email` mutation (prevents registration DoS), restricts trip member injection, and revokes table write grants on `public.wineries`. |
| **4** | [#94: enforce caller authentication, isolate private visit reviews from Gemini summaries, and harden Edge Functions](https://github.com/jarredb9/finger-lakes-app-57/issues/94) | Security / Functions | `v3.7.1` | `ready-for-agent` | **Data Privacy & API Hardening:** Filters private visit reviews from `get-winery-details` to prevent private user notes from leaking into Gemini prompts and public catalog `generative_summary`. Enforces caller authorization on `send-social-notification` to stop friend-graph harvesting, and turns on `verify_jwt = true` on Edge Functions to prevent billed API exhaustion. |
| **5** | [#73: Winery Showing Amenities Incorrectly](https://github.com/jarredb9/finger-lakes-app-57/issues/73) | Bug | `v3.7.1` | `agent:resolve` | **Critical Data Poisoning:** Prior coercion of `null` to `false` in `standardizeWineryData` poisoned `v2` IndexedDB caches, falsely telling users dog-friendly wineries are "Not Dog Friendly". Bump store to `version: 3` and heal falsified booleans. |
| **6** | [#75: PWA Hours Population Issue](https://github.com/jarredb9/finger-lakes-app-57/issues/75) | Bug | `v3.7.1` | `ready-for-agent` | **Core PWA Regression:** Edge function `shouldEnrich` cache deadlock + missing frontend Places masks + IndexedDB cache-purge loop leaves wineries with blank hours on iOS PWA. |
| **7** | [#41: Implement deep linking for winery share URLs (/winery/[id])](https://github.com/jarredb9/finger-lakes-app-57/issues/41) | Bug / Fix | `v3.8.0` | `ready-for-agent` | **Broken Core Journey:** The "Share" button produces `/winery/<id>`, which currently returns a **404 Not Found** in Next.js App Router. Highest user-facing embarrassment factor. |
| **8** | [#95: fix open redirects, password reset header poisoning, route exposures, service_role client cookie binding, and add security headers](https://github.com/jarredb9/finger-lakes-app-57/issues/95) | Security / Web | `v3.7.1` | `ready-for-agent` | **Web Perimeter & Route Hardening:** Sanitizes `redirectTo` in `/login` to stop open redirects. Derives password reset URLs strictly from configured base URLs (preventing host header poisoning). Disables `/debug` and `/manual-confirm` in production, decouples cookie stores from `createAdminClient()`, clamps `/api/wineries` parameters, and configures HTTP security headers in `next.config.mjs`. |
| **9** | [#96: fix winery URL render DoS, purge offline DLQ/stores across logouts, and sanitize photo uploads](https://github.com/jarredb9/finger-lakes-app-57/issues/96) | Security / Client | `v3.7.1` | `ready-for-agent` | **Client Resiliency & Storage Confidentiality:** Wraps `new URL(winery.website)` in safe parsing to prevent uncaught runtime exceptions from crashing WineryModal (Render DoS). Encrypts offline DLQ payloads and purges DLQ + IndexedDB stores on logout. Isolates multi-user state on account switch, and adds client-side photo MIME/size validation. |
| **10** | [#88: add HaveIBeenPwned k-anonymity leaked password check in sign-up and password reset](https://github.com/jarredb9/finger-lakes-app-57/issues/88) | Security / Auth | `v3.7.1` | `ready-for-agent` | **Auth Perimeter Hardening:** Supabase Free-tier lacks native leaked password protection (`auth_leaked_password_protection`). Implement client and server-side HaveIBeenPwned k-anonymity SHA-1 range checks on `/signup` and `/reset-password` with fail-open resilience. |
| **11** | [#50: Interactive Upcoming Trips Checklist in WineryModal](https://github.com/jarredb9/finger-lakes-app-57/issues/50) | Enhancement | `v3.8.0` | `ready-for-agent` | **Trip Planning Friction:** Replaces clumsy date-picker gate in `TripPlannerSection.tsx` with a 1-tap upcoming trips checklist. Directly improves primary trip-planning workflow. |
| **12** | [#89: Mobile Device "Search this area" button Overlap](https://github.com/jarredb9/finger-lakes-app-57/issues/89) | Bug / UI | `v3.8.0` | `agent:resolve` | **Map Leaf Presentation:** PR #99 opened. Responsive Tailwind offset (`top-14 sm:top-4`) preventing floating search button from colliding with style switcher on mobile viewports. |
| **13** | [#92: extract unified MapOverlayLayout to eliminate hardcoded absolute coordinates](https://github.com/jarredb9/finger-lakes-app-57/issues/92) | Refactor / Map | `v3.8.0` | `ready-for-agent` | **Map Architecture:** Architectural sibling following #89. Replaces scattered hardcoded absolute coordinates across MapView and WineryMap with a unified slot-based `MapOverlayLayout` container. |
| **14** | [#74: Support Visitor-confirmed Amenities & Decouple AI Vibe Tags](https://github.com/jarredb9/finger-lakes-app-57/issues/74) | Enhancement | `v3.8.0` | Needs Triage | **Architectural Sibling to #73:** Stops Gemini AI from generating conflicting `"Dog Friendly"` vibe tags when structured amenities are unknown/false, and allows on-site visitors to verify amenities. |
| **15** | [#47: Map Geolocation & Viewport Search UX ("Search This Area")](https://github.com/jarredb9/finger-lakes-app-57/issues/47) | Enhancement | `v3.8.0` | Interactive CLI | **Map Usability:** Introduces "Search This Area" floating pill and Mapbox geolocation centering FAB. Directly benefits all discovery workflows. |
| **16** | [#61: Standardize coordinate utilities & contract legacy RPC dual-keys](https://github.com/jarredb9/finger-lakes-app-57/issues/61) | Tech Debt | `v3.8.0` | `agent:resolve` | **Unblocked by #57:** Pure algorithmic/data refactoring in `lib/utils/geo.ts` to accept `{ latitude, longitude }` and contract legacy `lat`/`lng` aliases. Low blast radius. |
| **17** | [#55: Deprecate and remove legacy asymmetric follows schema & RPCs](https://github.com/jarredb9/finger-lakes-app-57/issues/55) | Tech Debt | `v3.8.0` | `ready-for-agent` | **ADR-0002 Enforcement:** Social model is strictly bidirectional friendships. Drops orphaned `follows` / `follow_requests` tables, obsolete RPCs, and legacy tests. Unblocked with zero dependencies. |
| **18** | [#52: Epic: TypeScript Code Health & 'any' Type Remediation Roadmap](https://github.com/jarredb9/finger-lakes-app-57/issues/52) | Tech Debt | `v3.8.0` | Interactive CLI | **Type Safety & Build Velocity:** Fast-track PR 1 (#53) is closed. Remaining PRs 2–4 target Supabase SQL RPC type generation and store shims, eliminating ~70 compiler errors. |
| **19** | [#31: Component Maintainability & Architectural Decomposition](https://github.com/jarredb9/finger-lakes-app-57/issues/31) | Refactor | `v3.8.0` | Interactive CLI | **All Blockers Resolved:** Prerequisites (#36, #37, #38) are now closed. Ready to break down 10 High Priority God Components (>250 LOC) across modals and cards. |
| **20** | [#32: Google OAuth Authentication & Existing Account Linking](https://github.com/jarredb9/finger-lakes-app-57/issues/32) | Feature | `v3.9.0` | Interactive CLI | **High Conversion Value:** All middleware prerequisites in `proxy.ts` (#35, #36) are resolved. Enables 1-click Google Sign-In with automatic account linking. |
| **21** | [#34: Winery Lifecycle & Rebranding Management](https://github.com/jarredb9/finger-lakes-app-57/issues/34) | Feature / DDL | `v3.9.0` | Interactive CLI | **Data Integrity:** Gracefully handles Google Places 404s when wineries close/rebrand, preserving historical visit logs while hiding closed wineries from exploration. Prerequisite #35 is closed. |
| **22** | [#13: Advanced Markers & PostGIS-Powered Regional Guides](https://github.com/jarredb9/finger-lakes-app-57/issues/13) | Feature | `v3.9.0` | Interactive CLI | **Visual Polish:** PostGIS regional boundaries and Mapbox marker status indicators (EV, Dogs, Visited). Consumes `business_status` from #34. |
| **23** | [#46: Feature: Social Visit Tagging & Shared History](https://github.com/jarredb9/finger-lakes-app-57/issues/46) | Feature | `v3.10.0` | Interactive CLI | **Social Expansion:** Tag friends on visits with mutual timeline updates and privacy enforcement. Preserved from archived tracks. |
| **24** | [#45: Feature: Taste Profiles & Smart Recommendations](https://github.com/jarredb9/finger-lakes-app-57/issues/45) | Feature | `v3.10.0` | Interactive CLI | **Discovery Personalization:** JSONB taste preferences and recommendation scoring based on friend activity. |
| **25** | [#48: Feature: Community Discovery & Global Activity Feed](https://github.com/jarredb9/finger-lakes-app-57/issues/48) | Feature | `v3.10.0` | Interactive CLI | **Broad Surface Area:** Realtime global activity feed. Lowest urgency until core community density reaches critical mass. |
| **—** | [#77: fix prompt token blowout from blast-radius test injection](https://github.com/jarredb9/finger-lakes-app-57/issues/77) | Infra / Bug | `Tooling` | `agent:resolve` | **Merged via PR #79:** Fixed prompt token blowout and hardened verification limits. Ready for maintainer closure. |
| **—** | [#84: Quality hardening via patch-based Red phase](https://github.com/jarredb9/finger-lakes-app-57/issues/84) | Infra / Refactor | `Tooling` | `ready-for-agent` | **Merged via PR #90:** Implemented patch-based Red phase, test deduplication, and linter gates. Ready for maintainer closure. |
| **—** | [#85: Extract agent-resolve into standalone engine repo](https://github.com/jarredb9/finger-lakes-app-57/issues/85) | Infra / Feature | `Tooling` | `ready-for-agent` | **Engine Decoupling:** Extract `scripts/agent-resolve` into an independent engine package with contract configuration. |
| **—** | [#86: Author setup-agent-resolve onboarding skill](https://github.com/jarredb9/finger-lakes-app-57/issues/86) | Infra / Skill | `Tooling` | `ready-for-agent` | **Skill Authoring:** Create interactive agent skill to bootstrap `agent-resolve` in target repositories. |

---

## 3. Detailed Issue Breakdown & Rationale

### Tier 1: Production Integrity, Secrets & Database/Edge Security (P0)

#### 1. [#97: security(ci): close agent Docker sandbox escape via Husky pre-commit, restrict production secrets in CI, and harden workflows](https://github.com/jarredb9/finger-lakes-app-57/issues/97)
- **Problem & Impact:**
  1. *Docker Sandbox Escape in `agent-resolve` (Critical / P0):* While `agent-resolve` isolates test execution inside a `--network none` read-only Docker container (`run_isolated_test`), `npm ci` installs `.husky/pre-commit` (`npx lint-staged` -> `eslint --fix` and `npm run type-check`). When `stage_2_red.py`, `stage_3_green.py`, or `preserve_failed_work()` in `vcs.py` calls `run_cmd(["git", "commit", ...])` without `--no-verify`, Git executes `.husky/pre-commit` **directly on the un-sandboxed host runner** with access to `GEMINI_API_KEY`, `GH_TOKEN` (write privileges), and outbound network. Compounding this, `patch_engine.py` lacks an allowlist for `blueprint.target_src_files` and omits config files (`eslint.config.mjs`, `.husky/pre-commit`, `package.json`, `.github/workflows/*`) from `PROTECTED_PATHS`.
  2. *Production `SUPABASE_DB_URL` Secret Exposed to PRs (Critical / P0):* The `build` job in `.github/workflows/ci.yml` runs on untrusted `pull_request` events and references `${{ secrets.SUPABASE_DB_URL }}` (`supabase db diff --db-url`) before running tests and builds. This exposes production database credentials to arbitrary external PR code.
  3. *GitHub Actions Expression Injection & `$GITHUB_ENV` Writes (High / P1):* In `agent-resolve.yml:122`, `${{ github.event.inputs.issue_number }}` is directly interpolated into a bash script. Gemini triage TOML commands expand unquoted issue text in shell contexts and instruct the LLM to write directly into `$GITHUB_ENV`.
  4. *Host Subprocess Fallback & Incomplete Redaction (High / P1):* If Docker is unavailable, tests silently fall back to running directly on the host. `SENSITIVE_ENV_KEYS` omits `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `SUPABASE_DB_URL`, `POSTGRES_PASSWORD`, and `JWT_SECRET`. Missing `--` delimiters in git/eslint/jest commands allows CLI option injection.
  5. *Local `.env` Hygiene & Admin DB Scripts (High / P1):* Local `.env` files have `0644` permissions and are mounted into containers. Admin DB scripts lack localhost checks, and `run-e2e-container.sh` uses `eval "$TEST_CMD"`.
- **Root Cause:** Reliance on git commits without `--no-verify` in autonomous runners, exposure of repository-level secrets on untrusted PR triggers, and lack of strict input sanitization/delimiters in workflow scripts.
- **Remediation:**
  - Pass `--no-verify` to all `git commit` invocations in `agent-resolve`; add `--ignore-scripts` to `npm ci` in workflows.
  - Enforce strict positive directory allowlists (`app/`, `components/`, `hooks/`, `lib/`, `utils/`) for `target_src_files` and expand `PROTECTED_PATHS` to block all configs, `.husky`, `.github`, and `scripts`.
  - Move `SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN`, and `VERCEL_TOKEN` strictly into the `Production` GitHub Environment gate; remove production `--db-url` from `pull_request` jobs.
  - Pass `inputs.issue_number` via `env:` with integer regex validation. Quote variables in Gemini commands and eliminate direct LLM writes to `$GITHUB_ENV`.
  - Fail closed in CI if Docker/Podman is unavailable; expand `SENSITIVE_ENV_KEYS` and `sanitize_secrets()`; add `--` delimiters before file path arguments.
  - `chmod 600` on `.env*` files, eliminate credential reuse, add localhost guards to `scripts/db/*`, and replace `eval` with positional array forwarding in container scripts.
- **Milestone:** Assigned to `v3.7.1 - Security Hardening & Production Defense`.
- **Execution Mode:** `ready-for-agent`.

#### 2. [#87: security(db): harden RLS, revoke anon & pg_graphql exposure, drop legacy RPCs, and default RPCs to SECURITY INVOKER](https://github.com/jarredb9/finger-lakes-app-57/issues/87)
- **Problem & Impact:** Supabase database security linter flags 97 warnings across 4 categories (`0026`, `0027`, `0028`, `0029`). Specifically:
  1. *Unauthenticated Winery Catalog Tampering (P0):* Legacy `upsert_wineries_from_search` is `SECURITY DEFINER` with no `auth.uid()` check and is executable by `anon`, allowing unauthenticated actors to overwrite canonical winery attributes (`name`, `address`, `location`). Active write RPCs (`ensure_winery`, `log_visit`, `create_trip_with_winery`) also execute `ON CONFLICT DO UPDATE`, letting users overwrite catalog attributes.
  2. *Unauthenticated Data & Email Exposure (P0):* Default schema grants give `anon` table permissions and execute rights on 25 `SECURITY DEFINER` functions. `is_visible_to_viewer` returns `TRUE` for public profiles even when `auth.uid() IS NULL`, and 33 of 34 RLS policies omit `TO authenticated`, leaking user emails and names to unauthenticated scrapers.
  3. *Cross-User Idempotency Key Bypass (P1):* Write RPCs (`update_visit`, `log_visit`, `create_trip`) query `WHERE idempotency_key = p_idempotency_key` without filtering by `AND user_id = auth.uid()`, leaking private visit payloads across users.
  4. *Unused pg_graphql Extension:* Exposes all 13 tables to GraphQL reflection despite zero GraphQL usage.
- **Root Cause:** Default Supabase public schema grants to `anon`, permissive `SECURITY DEFINER` function defaults, lack of `auth.uid() IS NOT NULL` guards, and lack of catalog attribute immutability in upsert conflict clauses.
- **Remediation:**
  - Create expand-and-contract migration `supabase/migrations/20261023000000_harden_rls_and_security_invoker_rpcs.sql`.
  - Revoke default schema privileges from `anon` and `authenticated`; restrict table access strictly to `authenticated` (and `service_role`).
  - Disable `pg_graphql` schema reflection in `supabase/config.toml` and `supabase/config.ci.toml`.
  - Drop 8 dead non-social RPCs and 2 deprecated follow RPCs; default remaining active RPCs to `SECURITY INVOKER`.
  - Keep `ensure_winery` as `SECURITY DEFINER` with insert-if-missing / backfill-nulls semantics to enforce catalog immutability.
  - Patch `is_visible_to_viewer` to require `auth.uid() IS NOT NULL`.
  - Add `AND user_id = auth.uid()` guards to idempotency key lookups.
  - Follow ADR-0007 (`docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md`).
- **Milestone:** Assigned to `v3.7.1 - Security Hardening & Production Defense`.
- **Execution Mode:** `ready-for-agent`.

#### 3. [#93: security(db): harden PostgREST direct table RLS, storage policies, trip/friend membership validation, and webhook GUC priority](https://github.com/jarredb9/finger-lakes-app-57/issues/93)
- **Problem & Impact:**
  1. *Unilateral Friendship Acceptance via Direct PostgREST `INSERT` on `public.friends` (Critical / P0):* The `"Users can create friend requests"` RLS policy only checks `auth.uid() = user1_id` without enforcing `status = 'pending'`. Any signed-in user can directly `POST /rest/v1/friends` with `{"user1_id": auth.uid(), "user2_id": victim_uuid, "status": "accepted"}` to bypass consent, immediately becoming an accepted friend and gaining access to the victim's `'friends_only'` profile, visits, favorites, wishlist, and private photos.
  2. *Public `visit-photos` Storage Bucket & Private Photo Exposure (High / P0):* `visit-photos` bucket was created with `public = true`, enabling unauthenticated direct URL access to photos via `/storage/v1/object/public/visit-photos/...` bypassing RLS. The `storage.objects` `SELECT` policy grants friends access to all objects in `<friend_uid>/*` without checking `visits.is_private`, exposing private visit photos to friends. No `allowed_mime_types` or `file_size_limit` is enforced (allowing executable `.svg`/`.html` uploads for Stored XSS).
  3. *Direct `profiles.email` Exposure, Mutation & Wildcard Hijacking (High / P1):* Direct PostgREST queries expose emails for users with `privacy_level = 'public'`. `"Users can update their own profile."` allows users to `UPDATE` their own `profiles.email` to an arbitrary unregistered email address. This causes `handle_new_user()` to fail on `UNIQUE(email)` when the victim registers, aborting the signup transaction (DoS). `WHERE email ILIKE TRIM(p_email)` in `add_trip_member_by_email` and `send_friend_request` allows wildcard pattern matching (`%`, `_`) for blind email enumeration.
  4. *Non-Consensual `trip_members` Injection & Permanent Trip Spam (High / P1):* Trip owners can insert arbitrary non-friend user UUIDs into `trip_members`. Once added, `get_trip_details` (`SECURITY DEFINER`) returns the target's name and email even if their profile is `'private'`. Non-owner members cannot leave or delete trips they were involuntarily added to.
  5. *Direct `INSERT` on `public.wineries` & Cache Poisoning (High / P1):* `"Authenticated users can insert wineries"` and table write grants remain active on `public.wineries`. Users can directly `INSERT` fake wineries with `enrichment_tier = 'enriched'` and `last_enriched_at = '2099-01-01'`, permanently poisoning the enrichment cache. `ensure_winery` does not validate coordinate ranges, rating bounds, or `^https?://` website URLs.
  6. *Webhook GUC Priority & Privacy Downgrade Bug (High / P1):* `handle_activity_ledger_notification` evaluates `current_setting('app.settings.supabase_url', true)` before `vault.decrypted_secrets`. `handle_activity_ledger_entry` records `privacy_level = 'public'` for activities logged by users whose profile is `'private'` when `NEW.is_private = false`. Multiple `SECURITY DEFINER` functions omit `pg_temp` from `search_path`.
- **Root Cause:** PostgREST direct table RLS policies lacking transition constraints, storage bucket misconfiguration (`public = true`), absence of column-level privilege restrictions on `profiles.email`, and incomplete input validation in catalog RPCs.
- **Remediation:**
  - Create expand-and-contract migration `supabase/migrations/20261023000001_harden_direct_table_rls_and_storage.sql`.
  - Add `CHECK (user1_id <> user2_id)` and unique pair index on `(LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id))`. Enforce `status = 'pending'` on INSERT RLS and restrict UPDATE RLS to `user2_id` with `status IN ('accepted', 'declined')`.
  - Set `visit-photos` `public = false`, `file_size_limit = 10485760`, and `allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']`. Update `storage.objects` `SELECT` policy to verify `public.is_visible_to_viewer(v.user_id, v.is_private)`.
  - Revoke `UPDATE (id, email)` on `public.profiles` from `authenticated`. Restrict direct `SELECT` on `profiles.email`. Replace `ILIKE` with `LOWER(email) = LOWER(TRIM(p_email))` and enforce unique index on `LOWER(email)`.
  - Require added trip members to be the trip owner or an accepted mutual friend. Allow non-owner members to `DELETE` their own row from `trip_members`.
  - Drop `"Authenticated users can insert wineries"` and revoke `INSERT, UPDATE, DELETE, TRUNCATE` from `anon, authenticated`. Validate coordinate ranges, rating bounds, and `^https?://` website URLs in `ensure_winery`.
  - Prioritize `vault.decrypted_secrets` before `app.settings.*`. Fix `handle_activity_ledger_entry` privacy level assignment, and append `, pg_temp` to all `SECURITY DEFINER` search paths.
- **Milestone:** Assigned to `v3.7.1 - Security Hardening & Production Defense`.
- **Execution Mode:** `ready-for-agent`.

#### 4. [#94: security(functions): enforce caller authentication, isolate private visit reviews from Gemini summaries, and harden Edge Functions](https://github.com/jarredb9/finger-lakes-app-57/issues/94)
- **Problem & Impact:**
  1. *Cross-User Private Visit Leakage & Prompt Injection into Global Catalog (High / P0):* In `supabase/functions/get-winery-details/index.ts:76-80`, the function queries `public.visits` using `SUPABASE_SERVICE_ROLE_KEY` (bypassing RLS) for user reviews without filtering by `.eq('is_private', false)` and without checking `profiles.privacy_level = 'public'`. Private visit notes are transmitted to external Gemini API and synthesized into `public.wineries.generative_summary` (globally visible). In `_shared/gemini.ts:188-191`, `generateSmartFallback` quotes up to 140 characters of private `user_review` verbatim into the global catalog. Untrusted `user_review` text concatenated directly into single-turn prompts allows prompt injection.
  2. *Unauthenticated Invocation & Friend-Graph Disclosure in `send-social-notification` (High / P0):* `send-social-notification` never validates caller credentials. It trusts caller-supplied `payload.record.user_id`, queries `friends` via `service_role`, and returns `{ success: true, notified: recipientIds }` in the HTTP response body, allowing arbitrary callers to harvest any user's friend graph.
  3. *Unauthenticated Execution & Paid API Quota Exhaustion (`verify_jwt = false`) (High / P1):* `search-wineries` and `get-winery-details` have `verify_jwt = false` in `supabase/config.toml` and contain no JWT validation logic in their request handlers. Unauthenticated internet actors can trigger billed Google Places V1 calls and Gemini generation, violating `CONTEXT.md` data access invariants.
  4. *URL Path Traversal / Parameter Injection in `get-winery-details` (Medium / P2):* `placeId` from JSON body is interpolated directly into `https://places.googleapis.com/v1/places/${placeId}` without regex validation or URL encoding, reflecting raw upstream error bodies.
- **Root Cause:** Use of `service_role` client without filtering on privacy flags, missing bearer token / webhook signature checks, disabling `verify_jwt` at the gateway without in-function JWT validation, and unvalidated parameter interpolation.
- **Remediation:**
  - In `get-winery-details/index.ts`, filter visits strictly by `.eq('is_private', false)` and `.eq('profiles.privacy_level', 'public')`.
  - Move instructions into Gemini `systemInstruction`, wrap reviews in structured tags, and validate/clamp parsed fields before persisting.
  - Require a constant-time Bearer token check matching `WEBHOOK_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` in `send-social-notification`. Verify `record.id` exists in `public.activity_ledger`, and do not return `recipientIds` in the HTTP response.
  - Set `verify_jwt = true` in `supabase/config.toml` and `supabase/config.ci.toml` for `search-wineries` and `get-winery-details`. Validate caller JWT via `supabase.auth.getUser(token)` in function handlers.
  - Validate `placeId` matches `^[A-Za-z0-9_-]{1,255}$` and URL-encode before external requests.
- **Milestone:** Assigned to `v3.7.1 - Security Hardening & Production Defense`.
- **Execution Mode:** `ready-for-agent`.

#### 5. [#73: Winery Showing Amenities Incorrectly](https://github.com/jarredb9/finger-lakes-app-57/issues/73)
- **Problem & Impact:** On iOS PWA (Standalone Mode), Toast Winery incorrectly displays as "Not Dog Friendly" (`allows_dogs: false`), whereas the browser displays "Unknown (Ask Reviews)". This misleads users and directly degrades trust.
- **Root Cause:** Historical coercion of `Boolean(null)` evaluating to `false` in `standardizeWineryData` poisoned client IndexedDB storage at `version: 2`. Although fresh sessions were patched via `parseTriStateBoolean`, returning users retain poisoned `false` values because `ensureWineryDetails` short-circuits on cached records.
- **Remediation:**
  - Bump `useWineryStore` `version` from `2` to `3`.
  - In `migrate(persistedState, version)`, reset any `false` on the 5 tri-state amenities (`allows_dogs`, `has_ev_charging`, `serves_wine`, `good_for_children`, `outdoor_seating`) back to `null`.
  - Coalesce omitted boolean fields in `supabase/functions/_shared/normalization.ts` to `null` (`?? null`).
- **Milestone:** Assigned to `v3.7.1 - Security Hardening & Production Defense`.
- **Execution Mode:** `agent:resolve` (headless overnight or single-turn CLI execution).

#### 6. [#75: PWA Hours Population Issue](https://github.com/jarredb9/finger-lakes-app-57/issues/75)
- **Problem & Impact:** Wineries opened on PWA fail to show operating hours, showing perpetual loading or dropping cached data on restart.
- **Root Cause:**
  1. `shouldEnrich` deadlock: Edge function checks rating, reviews, summary, photo freshness (<30 days), but never checks `opening_hours`, skipping enrichment when hours are missing.
  2. Missing field masks: Client `PlaceAutocomplete` constants omit `regularOpeningHours`.
  3. Purge loop: Rehydration migration in `wineryStore.ts` (lines 795–803) discards enriched wineries with null hours.
  4. Missing fallback: Confirmed unlisted hours are not distinguished from failed enrichments.
- **Remediation:**
  - Update `shouldEnrich` to trigger when `opening_hours` is null/empty.
  - Add `places.regularOpeningHours`, `websiteUri`, `internationalPhoneNumber` to client masks.
  - Render "Hours Unavailable" with winery website fallback link when Google confirms no hours.
- **Milestone:** Assigned to `v3.7.1 - Security Hardening & Production Defense`.
- **Execution Mode:** `ready-for-agent` (interactive CLI).

---

### Tier 2: Broken Core User Flows, Web & Client Perimeter Hardening (P1)

#### 7. [#41: Implement deep linking for winery share URLs (/winery/[id])](https://github.com/jarredb9/finger-lakes-app-57/issues/41)
- **Problem & Impact:** The "Share" button in `WineryActionsPresentational.tsx` generates links in the format `https://<domain>/winery/<winery-ID>`. Navigating to this URL currently yields a **404 Not Found**.
- **Root Cause:** Next.js App Router lacks a dynamic route handler for `/winery/[id]`.
- **Remediation:**
  - Implement `app/winery/[id]/page.tsx` with server-side auth checking.
  - Hydrate `initialWineryId` into `AppShell` and open the responsive modal tier (`DesktopWineryModal`, `TabletWinerySheet`, `MobileWineryDrawer`).
  - Fly Mapbox camera to resolved coordinates.
  - Sync address bar back to `/` on modal dismissal via `window.history.replaceState`.
- **Milestone:** Assigned to `v3.8.0 - Component Decomposition & UI Modernization`.
- **Execution Mode:** `ready-for-agent`.

#### 8. [#95: security(web): fix open redirects, password reset header poisoning, route exposures, service_role client cookie binding, and add security headers](https://github.com/jarredb9/finger-lakes-app-57/issues/95)
- **Problem & Impact:**
  1. *Open Redirect in `/login` (High / P1):* In `app/login/page.tsx:5-11` and `components/login-form.tsx:40-45`, `redirectTo` from query string is passed directly to `redirect()` and `router.push()` without verifying that it is a relative internal path, allowing external or protocol-relative redirects (`https://...` or `//...`).
  2. *Password Reset Host Header / `X-Forwarded-Proto` Poisoning (High / P1):* In `app/actions/auth.ts:96-106`, `forgotPasswordAction` constructs reset `redirectTo` URL from untrusted `host` and `x-forwarded-proto` request headers. `app/api/auth/forgot-password/route.ts` is an unused duplicate endpoint publicly exposed in `proxy.ts:11`.
  3. *Production Exposure of `/debug`, `/manual-confirm`, and E2E Reset Bypass (High/Medium):* `app/debug/page.tsx` has no production environment guard, dumping all visits and raw database errors. `app/manual-confirm/page.tsx` is publicly exposed in `proxy.ts:8`, auto-confirming users in dev. In `app/api/auth/reset-password/route.ts`, an E2E mock code check is active without gating on `NODE_ENV !== 'production'`.
  4. *Cookie-Bound `SUPABASE_SERVICE_ROLE_KEY` Client (Medium / P2):* `createAdminClient()` calls `@supabase/ssr`'s `createServerClient` wired to `await cookies()`, allowing user cookies to override authorization headers or leak admin session state back into browser cookies.
  5. *API Quota Exhaustion & Unbounded Pagination in `/api/wineries` (Medium / P2):* Triggers unthrottled Google Places searches and service-role upserts with unclamped `page` and `limit`.
  6. *Absence of HTTP Security Headers & Bidirectional `IS_E2E` Inlining (Medium / P2):* Missing CSP, X-Frame-Options, and Referrer-Policy (critical on `/reset-password?code=...` to prevent token leakage via `Referer`). `IS_E2E` inlined into client bundle skips auth redirects.
- **Root Cause:** Untrusted query and header interpolation into redirects, exposed debug routes, cookie-wired service-role client, and missing HTTP response security headers.
- **Remediation:**
  - Sanitize `redirectTo` to ensure it starts with `/` and not `//` or `/\\`.
  - Derive password reset URLs exclusively from configured environment variables (`NEXT_PUBLIC_SITE_URL` / `VERCEL_PROJECT_PRODUCTION_URL`), delete unused `app/api/auth/forgot-password/route.ts`, and remove its route from `proxy.ts`.
  - Guard `app/debug/page.tsx` and `app/manual-confirm/page.tsx` with `if (process.env.NODE_ENV === 'production') notFound();`, and remove `/manual-confirm` from `publicRoutes`.
  - Gate E2E mock bypass in `/api/auth/reset-password` behind `process.env.NODE_ENV !== 'production' && process.env.IS_E2E === 'true'`, and enforce server-side password length.
  - Refactor `utils/supabase/admin.ts` to use `@supabase/supabase-js` with `persistSession: false` and `import "server-only"`, removing all cookie store wiring.
  - Clamp `page` and `limit` in `/api/wineries`, validate `query.length`, route writes through `ensure_winery`, and use a server-only Google Maps key.
  - Add `async headers()` in `next.config.mjs` with standard security headers (CSP, Referrer-Policy, X-Frame-Options). Remove client `env:` block in production builds.
- **Milestone:** Assigned to `v3.7.1 - Security Hardening & Production Defense`.
- **Execution Mode:** `ready-for-agent`.

#### 9. [#96: security(client): fix winery URL render DoS, purge offline DLQ/stores across logouts, and sanitize photo uploads](https://github.com/jarredb9/finger-lakes-app-57/issues/96)
- **Problem & Impact:**
  1. *Stored Client-Side Render DoS via Uncaught `new URL(winery.website)` (High / P1):* In `components/winery/winery-info-card.tsx:168`, `new URL(winery.website).hostname` is called inline during React render without `try/catch`. Protocol-less domains (`"www.example.com"`) or malformed URLs throw uncaught `TypeError: Invalid URL`, crashing the entire view (`app/error.tsx`) for any user opening that winery modal. `winery.website` and `winery.phone` are rendered in `<a href={...}>` without validating `http:`/`https:` protocol or sanitizing phone characters.
  2. *Offline DLQ Persists Plaintext Payloads for 7 Days Surviving Logout (High / P1):* When an offline mutation hits a 4xx error, `routeToDLQ` writes decrypted plaintext payloads (private visit reviews, Base64 photos, trip notes) into IndexedDB under `'offline-mutation-dlq'` with a 7-day expiration. `logout()` never purges `'offline-mutation-dlq'` or `SyncService.dlqEntries` (which is attached to `window.SyncService` in production).
  3. *Cross-User IndexedDB State Leakage & Queue Corruption on Account Switch (High / P1):* If User A logs out without visiting `/logout` (or session expires) and User B logs in on the same browser, previous IndexedDB stores (`visit-storage`, `trip-storage`, `winery-data-storage`) are retained. In `SyncService.sync()`, mutations are not filtered by `item.userId === user.id`, failing decryption with User B's ID and permanently breaking User A's queued mutations (`status: 'error'`).
  4. *Unawaited IndexedDB Resets & Incomplete SW Cache Purge (High / P1):* `userStore.logout()` invokes `.reset()` synchronously without awaiting `.persist.clearStorage()`. In-flight fetches commit data after logout. Neither `logout()` nor `sw.ts` purges the `'supabase-storage'` CacheStorage bucket.
  5. *Offline Queue Encryption Derived from Plaintext `userId` (Medium / P2):* AES key is derived from `userId` stored in plaintext inside the same `SyncItem` record.
  6. *Missing Photo Validation & Unsanitized Paths (Medium / P2):* `PhotoUploader.tsx` lacks runtime size/MIME validation, converting files to uncompressed Base64. Raw `file.name` is interpolated into storage paths.
  7. *Third-Party Email Leakage in `i.pravatar.cc` (Low / P3):* User and friend email addresses are sent in plaintext in avatar image URLs.
- **Root Cause:** Direct instantiation of `new URL()` in React render, lack of DLQ encryption and logout purge routines, lack of user identity gating before IndexedDB rehydration, and missing client-side file upload guards.
- **Remediation:**
  - Implement a safe URL parser in `lib/utils/winery.ts` that enforces `http:`/`https:` protocols and never throws during React render.
  - Store only `item.encryptedPayload` in the DLQ. Add `SyncService.reset()` to delete `'offline-mutation-dlq'` and clear in-memory arrays, and await it on logout. Gate `window.SyncService` behind `process.env.NEXT_PUBLIC_IS_E2E === 'true'`.
  - Track `_LAST_AUTH_USER_ID`; if authenticated user changes, clear IndexedDB stores before hydration. Filter offline queue items by `item.userId === user.id` in `SyncService.sync()`, `visitInitHelpers.ts`, and `tripInitHelpers.ts`.
  - Await `.persist.clearStorage()` across all stores, delete `'supabase-storage'` in `userStore.logout()` and `app/sw.ts`, and guard async fetch commits.
  - Validate file size (`<= 5MB`) and allowed MIME types in `PhotoUploader.tsx`, compress before Base64 conversion, and generate sanitized UUID filenames for storage paths.
  - Replace `i.pravatar.cc` email URLs with local initials or opaque identifiers.
- **Milestone:** Assigned to `v3.7.1 - Security Hardening & Production Defense`.
- **Execution Mode:** `ready-for-agent`.

#### 10. [#88: security(auth): add HaveIBeenPwned k-anonymity leaked password check in sign-up and password reset](https://github.com/jarredb9/finger-lakes-app-57/issues/88)
- **Problem & Impact:** Supabase security advisor reports `auth_leaked_password_protection` ("Leaked Password Protection Disabled"). Free-tier Supabase does not include native HIBP checking, leaving the application vulnerable to credential stuffing with known breached passwords on signup and password reset.
- **Root Cause:** Absence of client- and server-side leaked password validation before account creation and password updates.
- **Remediation:**
  - Create `lib/utils/password-security.ts` with `isPasswordCompromised(password: string): Promise<boolean>` using Web Crypto SHA-1 and the HaveIBeenPwned k-anonymity range API (`https://api.pwnedpasswords.com/range/${prefix}`) with 3-second timeout and fail-open resilience.
  - Integrate into `components/signup-form.tsx` to block registration with breached passwords.
  - Integrate client-side check into `components/reset-password-form.tsx`.
  - Integrate server-side defense-in-depth into `app/api/auth/reset-password/route.ts` executed *before* `supabase.auth.exchangeCodeForSession(code)` so one-time recovery codes are never burned on rejected passwords.
  - Add comprehensive unit tests in `lib/utils/__tests__/password-security.test.ts` and `components/__tests__/auth-forms.test.tsx`.
- **Milestone:** Assigned to `v3.7.1 - Security Hardening & Production Defense`.
- **Execution Mode:** `ready-for-agent`.

---

### Tier 3: Core UX Enablers & Milestone v3.8.0 Alignment

#### 11. [#50: Interactive Upcoming Trips Checklist in WineryModal](https://github.com/jarredb9/finger-lakes-app-57/issues/50)
- **Problem & Impact:** In the "Trip" tab of `WineryModal`, users cannot easily add a winery to an existing upcoming trip without manually picking a date from a date picker.
- **Remediation:** Replace date picker gate with an interactive upcoming trips checklist showing 1-tap `[+ Add]` and `[✕ Remove]` actions, optimistic toast feedback, and stop notes expansion.
- **Milestone:** Assigned to `v3.8.0 - Component Decomposition & UI Modernization`.

#### 12. [#89: Mobile Device "Search this area" button Overlap of "Outdoor/Streets" Selector](https://github.com/jarredb9/finger-lakes-app-57/issues/89)
- **Problem & Impact:** On narrow mobile viewports (<430px), `FloatingSearchAreaButton` rendered at `top-4 left-1/2` collides with `MapStyleSwitcher` rendered at `top-4 left-4`.
- **Remediation:** Draft PR #99 authored by autonomous agent applying responsive Tailwind classes (`top-14 sm:top-4`).
- **Milestone:** Assigned to `v3.8.0 - Component Decomposition & UI Modernization`.

#### 13. [#92: refactor(map): extract unified MapOverlayLayout to eliminate hardcoded absolute coordinates](https://github.com/jarredb9/finger-lakes-app-57/issues/92)
- **Problem & Impact:** Hardcoded absolute coordinates (`top-4`, `left-4`, `top-14`) are scattered across `WineryMap.tsx`, `MapView.tsx`, and `floating-search-area-button.tsx`, coupling sibling layouts.
- **Remediation:** Extract slot-based `MapOverlayLayout` container (`TopLeft`, `TopCenter`, `TopBanner`, `BottomLeft`) managing single stacking context and pointer event dispatching.
- **Milestone:** Assigned to `v3.8.0 - Component Decomposition & UI Modernization`.

#### 14. [#74: Support Visitor-confirmed Amenities & Decouple AI Vibe Tags](https://github.com/jarredb9/finger-lakes-app-57/issues/74)
- **Problem & Impact:** Gemini AI vibe tags frequently emit duplicate amenity phrases (`"Dog Friendly"`, `"EV Charging"`), causing visual contradictions between the modal header badges and the structured Amenities tab.
- **Remediation:**
  - Decouple AI vibe prompt instructions in `supabase/functions/_shared/gemini.ts` from structured facility attributes.
  - Allow on-site visitors logging a visit via `VisitForm` to confirm amenities to crowdsource missing Google data.
- **Milestone:** Assigned to `v3.8.0 - Component Decomposition & UI Modernization`.

#### 15. [#47: Map Geolocation & Viewport Search UX ("Search This Area")](https://github.com/jarredb9/finger-lakes-app-57/issues/47)
- **Problem & Impact:** Users exploring the map have no one-touch way to center the map on their location or manually trigger a search of the currently visible bounding box.
- **Remediation:** Implement `useGeolocation` hook, top-center "Search This Area" dirty-viewport button, and map FAB location trigger.
- **Milestone:** Assigned to `v3.8.0 - Component Decomposition & UI Modernization`.

---

### Tier 4: Foundational Architecture & Technical Debt

#### 16. [#61: Standardize coordinate utilities & contract legacy RPC dual-keys](https://github.com/jarredb9/finger-lakes-app-57/issues/61)
- **Prerequisites:** Issue #57 is **CLOSED**.
- **Scope:** Update `calculateDistance` in `lib/utils/geo.ts` to accept canonical `{ latitude, longitude }`, remove manual reshaping in `TripCardPresentational.tsx`, and contract obsolete `lat`/`lng` JSON keys in PostgreSQL RPC responses.
- **Milestone:** Assigned to `v3.8.0 - Component Decomposition & UI Modernization`.
- **Execution Mode:** `agent:resolve` eligible.

#### 17. [#55: Deprecate and remove legacy asymmetric follows schema & RPCs](https://github.com/jarredb9/finger-lakes-app-57/issues/55)
- **Prerequisites:** None (ADR-0002 is fully adopted; #87 revokes schema grants on legacy follows tables).
- **Scope:** Cleanly drop obsolete `public.follows` and `public.follow_requests` tables, drop deprecated RPCs (`send_follow_request`, `respond_to_follow_request`), and regenerate TypeScript definitions.
- **Milestone:** Assigned to `v3.8.0 - Component Decomposition & UI Modernization`.

#### 18. [#52: Epic: TypeScript Code Health & 'any' Type Remediation Roadmap](https://github.com/jarredb9/finger-lakes-app-57/issues/52)
- **Status:** Fast-track PR 1 (#53) is **CLOSED**.
- **Scope:** Execute PR 2 (Offline Crypto & Stores), PR 3 (Supabase SQL Migrations & Map Layer), and PR 4 (Component Polish) to eliminate unchecked `any` casts and enable automatic Supabase CLI type generation.
- **Milestone:** Assigned to `v3.8.0 - Component Decomposition & UI Modernization`.

#### 19. [#31: Component Maintainability & Architectural Decomposition](https://github.com/jarredb9/finger-lakes-app-57/issues/31)
- **Prerequisites:** Issues #36, #37, and #38 are **CLOSED**.
- **Scope:** Refactor 10 God Components (>250 LOC) mixing store logic, SDK bindings, and JSX into presentational/container sub-components with React 19 `useActionState` forms.
- **Milestone:** Assigned to `v3.8.0 - Component Decomposition & UI Modernization`.

---

### Tier 5: Strategic Platform Capabilities (Milestone v3.9.0)

#### 20. [#32: Google OAuth Authentication & Existing Account Linking](https://github.com/jarredb9/finger-lakes-app-57/issues/32)
- **Prerequisites:** Issues #35 and #36 are **CLOSED** (redirect cookie forwarding and `/privacy` route whitelisting implemented in `proxy.ts`).
- **Scope:** Supabase Auth Google provider integration with automatic linking for existing email/password accounts with matching email.
- **Milestone:** Assigned to `v3.9.0 - Platform Feature Expansions`.

#### 21. [#34: Winery Lifecycle & Rebranding Management](https://github.com/jarredb9/finger-lakes-app-57/issues/34)
- **Prerequisites:** Issue #35 (BE-07, BE-15) is **CLOSED**.
- **Scope:** Handle closed or rebranded wineries by introducing `business_status` (`OPERATIONAL`, `CLOSED_PERMANENTLY`, `ARCHIVED`) and `rebrand_history` JSONB tracking, preventing broken Place IDs while preserving user visit histories.
- **Milestone:** Assigned to `v3.9.0 - Platform Feature Expansions`.

#### 22. [#13: Advanced Markers & PostGIS-Powered Regional Guides](https://github.com/jarredb9/finger-lakes-app-57/issues/13)
- **Prerequisites:** Coordinate with #34 and #35.
- **Scope:** PostGIS-backed `regions` boundary polygons in Supabase and Mapbox custom HTML markers with status emblems (Visited, EV, Dogs).
- **Milestone:** Assigned to `v3.9.0 - Platform Feature Expansions`.

---

### Tier 6: Long-term Social & Discovery Backlog (Milestone v3.10.0)

#### 23. [#46: Feature: Social Visit Tagging & Shared History](https://github.com/jarredb9/finger-lakes-app-57/issues/46)
- **Scope:** `visit_participants` schema, atomic `log_visit_with_friends` RPC, friend picker UI in `VisitForm`, and mutual privacy enforcement.
- **Milestone:** Assigned to `v3.10.0 - Social Discovery & Recommendation Platform`.

#### 24. [#45: Feature: Taste Profiles & Smart Recommendations](https://github.com/jarredb9/finger-lakes-app-57/issues/45)
- **Scope:** Structured `taste_preferences` JSONB on profiles, `get_taste_matches` affinity scoring RPC, and recommendation badges.
- **Milestone:** Assigned to `v3.10.0 - Social Discovery & Recommendation Platform`.

#### 25. [#48: Feature: Community Discovery & Global Activity Feed](https://github.com/jarredb9/finger-lakes-app-57/issues/48)
- **Scope:** Realtime public activity stream with cursor pagination over `activity_ledger` and public feed UI.
- **Milestone:** Assigned to `v3.10.0 - Social Discovery & Recommendation Platform`.

---

### Tier 7: Autonomous Developer Tooling & Pipeline Infrastructure

#### [#77: fix prompt token blowout from blast-radius test injection](https://github.com/jarredb9/finger-lakes-app-57/issues/77)
- **Status:** **Merged via PR #79.** Ready for maintainer closure.
- **Milestone:** Assigned to `Tooling: agent-resolve Engine & Developer Experience`.

#### [#84: Quality hardening via patch-based Red phase](https://github.com/jarredb9/finger-lakes-app-57/issues/84)
- **Status:** **Merged via PR #90.** Ready for maintainer closure.
- **Milestone:** Assigned to `Tooling: agent-resolve Engine & Developer Experience`.

#### [#85: feat(infra): Extract agent-resolve into standalone engine repo](https://github.com/jarredb9/finger-lakes-app-57/issues/85)
- **Scope:** Extract `scripts/agent-resolve/agent_resolve` into a standalone engine repository with schema-driven contracts for test runners and patch engines.
- **Milestone:** Assigned to `Tooling: agent-resolve Engine & Developer Experience`.

#### [#86: feat(skill): Author setup-agent-resolve onboarding skill](https://github.com/jarredb9/finger-lakes-app-57/issues/86)
- **Scope:** Interactive CLI skill to scaffold and calibrate `agent-resolve` workflows and test container configurations on new repositories.
- **Milestone:** Assigned to `Tooling: agent-resolve Engine & Developer Experience`.

---

## 4. Immediate Phasing & Execution Next Steps

```
Milestone v3.7.0 Release Gate
 └── Tag v3.7.0 & bump package.json version -> Closes Milestone v3.7.0 (0 open issues)
 │
Milestone v3.7.1 - Security Hardening & Production Defense (P0 / P1)
 ├── Step 1: Fix #97 (CI & Runner Security) -> Close Docker sandbox escape & protect CI secrets (ready-for-agent)
 ├── Step 2: Fix #87 (Database Security Part 1) -> Drop dead RPCs, disable pg_graphql, enforce SECURITY INVOKER & catalog immutability (ready-for-agent)
 ├── Step 3: Fix #93 (Database Security Part 2) -> PostgREST direct RLS, storage bucket privacy, friend/trip consent (ready-for-agent)
 ├── Step 4: Fix #94 (Edge Functions Security) -> Isolate private visits from Gemini, authorize webhooks, verify JWTs (ready-for-agent)
 ├── Step 5: Fix #73 (Amenities Bug) -> Store version 3 bump & IndexedDB heal (agent:resolve)
 ├── Step 6: Fix #75 (PWA Hours Bug) -> shouldEnrich healing + Places client masks (ready-for-agent)
 ├── Step 7: Fix #95 (Web Route & Auth Hardening) -> Open redirect sanitize, reset host header fix, route guards, security headers (ready-for-agent)
 ├── Step 8: Fix #96 (Client Stability & Storage Privacy) -> URL render crash fix, DLQ encryption/purge on logout, user isolation (ready-for-agent)
 └── Step 9: Implement #88 (HaveIBeenPwned Leaked Password Check) -> k-anonymity utility & form gates (ready-for-agent) -> Closes Milestone v3.7.1
 │
Milestone v3.8.0 - Component Decomposition & UI Modernization
 ├── Step 10: Fix #41 (Deep Linking 404) -> Dynamic /winery/[id] route implementation (ready-for-agent)
 ├── Step 11: Implement #50 (WineryModal Upcoming Trips Checklist)
 ├── Step 12: Merge #89 / Execute #92 (MapOverlayLayout Slot Architecture)
 ├── Step 13: Execute #52 (TypeScript Epic PR 2 & 3)
 ├── Step 14: Execute #61 (Coordinate standardizations) & #55 (Drop deprecated follows schema)
 └── Step 15: Execute #31 (Component Decomposition) -> Closes Milestone v3.8.0
 │
Milestone v3.9.0 - Platform Feature Expansions
 ├── Step 16: Implement #32 (Google OAuth & Account Linking)
 ├── Step 17: Implement #34 (Winery Lifecycle / Rebranding)
 └── Step 18: Implement #13 (Mapbox Markers & PostGIS Regions) -> Closes Milestone v3.9.0
 │
Milestone v3.10.0 - Social Discovery & Recommendations
 └── Step 19: Implement #46 (Social Tagging), #45 (Taste Profiles), #48 (Community Feed)
```
