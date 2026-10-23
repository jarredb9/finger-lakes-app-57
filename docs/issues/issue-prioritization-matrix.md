# GitHub Issue Prioritization & Rack-and-Stack Matrix

**Repository:** `jarredb9/finger-lakes-app-57`  
**Date:** October 23, 2026  
**Author:** Staff Software Engineer & Architect  
**Active Milestones:**
- `v3.8.0 - Component Decomposition & UI Modernization` (Open issues: #52, #41, #31)
- `v3.9.0 - Platform Feature Expansions` (Open issues: #34, #32, #13)
- `v3.7.0 - Bug Fixes, Incomplete Implementations, and PWA Testing Updates` (Complete / Closed)

---

## 1. Prioritization Framework

Issues are ranked by balancing user impact, data integrity risk, architectural dependencies, and milestone alignment:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Tier 1: Production Integrity, Database Security & False Data (P0)      │
│ Unauthenticated catalog tampering, email/PII exposure, client cache   │
│ poisoning, and false user-facing data on mobile.                       │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 2: Broken Core User Flows & Auth Perimeter Hardening (P1)         │
│ Dead-end interactions (e.g. 404 on winery share URLs) and credential   │
│ breach vulnerability remediation (HIBP k-anonymity checks).            │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 3: Core UX Enablers & Milestone v3.8.0 Alignment                 │
│ Primary planning friction (#50) and active milestone deliverables.     │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 4: Foundational Architecture & Technical Debt                    │
│ Unblocked schema contractions, dead-code removal, type hardening.     │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 5: Strategic Platform Capabilities (Milestone v3.9.0)            │
│ Major platform features (Google OAuth, winery lifecycle, PostGIS).     │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 6: Long-term Social & Discovery Backlog                           │
│ Features requiring community density and social network scale.         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Master Ranked Stack

| Rank | Issue | Type | Milestone | Execution Mode | Strategic Summary |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **1** | [#87: harden RLS, revoke anon & pg_graphql exposure, drop legacy RPCs, and default RPCs to SECURITY INVOKER](https://github.com/jarredb9/finger-lakes-app-57/issues/87) | Security / DB | None | `ready-for-agent` | **Critical Security & Production Integrity:** Resolves 97 Supabase security linter warnings. Revokes `anon`/`authenticated` default schema privileges, restricts `anon` table access, defaults RPCs to `SECURITY INVOKER`, prevents unauthenticated catalog overwrites, isolates cross-user idempotency keys, and disables `pg_graphql` (ADR-0007). |
| **2** | [#73: Winery Showing Amenities Incorrectly](https://github.com/jarredb9/finger-lakes-app-57/issues/73) | Bug | None | `agent:resolve` | **Critical Data Poisoning:** Prior coercion of `null` to `false` in `standardizeWineryData` poisoned `v2` IndexedDB caches, falsely telling users dog-friendly wineries are "Not Dog Friendly". Bump store to `version: 3` and heal falsified booleans. |
| **3** | [#75: PWA Hours Population Issue](https://github.com/jarredb9/finger-lakes-app-57/issues/75) | Bug | None | `ready-for-agent` | **Core PWA Regression:** Edge function `shouldEnrich` cache deadlock + missing frontend Places masks + IndexedDB cache-purge loop leaves wineries with blank hours on iOS PWA. |
| **4** | [#41: Implement deep linking for winery share URLs (/winery/[id])](https://github.com/jarredb9/finger-lakes-app-57/issues/41) | Bug / Fix | v3.8.0 | `ready-for-agent` | **Broken Core Journey:** The "Share" button produces `/winery/<id>`, which currently returns a **404 Not Found** in Next.js App Router. Highest user-facing embarrassment factor. |
| **5** | [#88: add HaveIBeenPwned k-anonymity leaked password check in sign-up and password reset](https://github.com/jarredb9/finger-lakes-app-57/issues/88) | Security / Auth | None | `ready-for-agent` | **Auth Perimeter Hardening:** Supabase Free-tier lacks native leaked password protection (`auth_leaked_password_protection`). Implement client and server-side HaveIBeenPwned k-anonymity SHA-1 range checks on `/signup` and `/reset-password` with fail-open resilience. |
| **6** | [#50: Interactive Upcoming Trips Checklist in WineryModal](https://github.com/jarredb9/finger-lakes-app-57/issues/50) | Enhancement | None | `ready-for-agent` | **Trip Planning Friction:** Replaces clumsy date-picker gate in `TripPlannerSection.tsx` with a 1-tap upcoming trips checklist. Directly improves primary trip-planning workflow. |
| **7** | [#74: Support Visitor-confirmed Amenities & Decouple AI Vibe Tags](https://github.com/jarredb9/finger-lakes-app-57/issues/74) | Enhancement | None | Needs Triage | **Architectural Sibling to #73:** Stops Gemini AI from generating conflicting `"Dog Friendly"` vibe tags when structured amenities are unknown/false, and allows on-site visitors to verify amenities. |
| **8** | [#47: Map Geolocation & Viewport Search UX ("Search This Area")](https://github.com/jarredb9/finger-lakes-app-57/issues/47) | Enhancement | None | Interactive CLI | **Map Usability:** Introduces "Search This Area" floating pill and Mapbox geolocation centering FAB. Directly benefits all discovery workflows. |
| **9** | [#61: Standardize coordinate utilities & contract legacy RPC dual-keys](https://github.com/jarredb9/finger-lakes-app-57/issues/61) | Tech Debt | None | `agent:resolve` | **Unblocked by #57:** Pure algorithmic/data refactoring in `lib/utils/geo.ts` to accept `{ latitude, longitude }` and contract legacy `lat`/`lng` aliases. Low blast radius. |
| **10** | [#55: Deprecate and remove legacy asymmetric follows schema & RPCs](https://github.com/jarredb9/finger-lakes-app-57/issues/55) | Tech Debt | None | `ready-for-agent` | **ADR-0002 Enforcement:** Social model is strictly bidirectional friendships. Drops orphaned `follows` / `follow_requests` tables, obsolete RPCs, and legacy tests. Unblocked with zero dependencies. |
| **11** | [#52: Epic: TypeScript Code Health & 'any' Type Remediation Roadmap](https://github.com/jarredb9/finger-lakes-app-57/issues/52) | Tech Debt | v3.8.0 | Interactive CLI | **Type Safety & Build Velocity:** Fast-track PR 1 (#53) is closed. Remaining PRs 2–4 target Supabase SQL RPC type generation and store shims, eliminating ~70 compiler errors. |
| **12** | [#31: Component Maintainability & Architectural Decomposition](https://github.com/jarredb9/finger-lakes-app-57/issues/31) | Refactor | v3.8.0 | Interactive CLI | **All Blockers Resolved:** Prerequisites (#36, #37, #38) are now closed. Ready to break down 10 High Priority God Components (>250 LOC) across modals and cards. |
| **13** | [#32: Google OAuth Authentication & Existing Account Linking](https://github.com/jarredb9/finger-lakes-app-57/issues/32) | Feature | v3.9.0 | Interactive CLI | **High Conversion Value:** All middleware prerequisites in `proxy.ts` (#35, #36) are resolved. Enables 1-click Google Sign-In with automatic account linking. |
| **14** | [#34: Winery Lifecycle & Rebranding Management](https://github.com/jarredb9/finger-lakes-app-57/issues/34) | Feature / DDL | v3.9.0 | Interactive CLI | **Data Integrity:** Gracefully handles Google Places 404s when wineries close/rebrand, preserving historical visit logs while hiding closed wineries from exploration. Prerequisite #35 is closed. |
| **15** | [#13: Advanced Markers & PostGIS-Powered Regional Guides](https://github.com/jarredb9/finger-lakes-app-57/issues/13) | Feature | v3.9.0 | Interactive CLI | **Visual Polish:** PostGIS regional boundaries and Mapbox marker status indicators (EV, Dogs, Visited). Consumes `business_status` from #34. |
| **16** | [#46: Feature: Social Visit Tagging & Shared History](https://github.com/jarredb9/finger-lakes-app-57/issues/46) | Feature | Backlog | Interactive CLI | **Social Expansion:** Tag friends on visits with mutual timeline updates and privacy enforcement. Preserved from archived tracks. |
| **17** | [#45: Feature: Taste Profiles & Smart Recommendations](https://github.com/jarredb9/finger-lakes-app-57/issues/45) | Feature | Backlog | Interactive CLI | **Discovery Personalization:** JSONB taste preferences and recommendation scoring based on friend activity. |
| **18** | [#48: Feature: Community Discovery & Global Activity Feed](https://github.com/jarredb9/finger-lakes-app-57/issues/48) | Feature | Backlog | Interactive CLI | **Broad Surface Area:** Realtime global activity feed. Lowest urgency until core community density reaches critical mass. |

---

## 3. Detailed Issue Breakdown & Rationale

### Tier 1: Production Integrity, Database Security & False Data Prevention (P0)

#### 1. [#87: security(db): harden RLS, revoke anon & pg_graphql exposure, drop legacy RPCs, and default RPCs to SECURITY INVOKER](https://github.com/jarredb9/finger-lakes-app-57/issues/87)
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
- **Execution Mode:** `ready-for-agent`.

#### 2. [#73: Winery Showing Amenities Incorrectly](https://github.com/jarredb9/finger-lakes-app-57/issues/73)
- **Problem & Impact:** On iOS PWA (Standalone Mode), Toast Winery incorrectly displays as "Not Dog Friendly" (`allows_dogs: false`), whereas the browser displays "Unknown (Ask Reviews)". This misleads users and directly degrades trust.
- **Root Cause:** Historical coercion of `Boolean(null)` evaluating to `false` in `standardizeWineryData` poisoned client IndexedDB storage at `version: 2`. Although fresh sessions were patched via `parseTriStateBoolean`, returning users retain poisoned `false` values because `ensureWineryDetails` short-circuits on cached records.
- **Remediation:**
  - Bump `useWineryStore` `version` from `2` to `3`.
  - In `migrate(persistedState, version)`, reset any `false` on the 5 tri-state amenities (`allows_dogs`, `has_ev_charging`, `serves_wine`, `good_for_children`, `outdoor_seating`) back to `null`.
  - Coalesce omitted boolean fields in `supabase/functions/_shared/normalization.ts` to `null` (`?? null`).
- **Execution Mode:** `agent:resolve` (headless overnight or single-turn CLI execution).

#### 3. [#75: PWA Hours Population Issue](https://github.com/jarredb9/finger-lakes-app-57/issues/75)
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
- **Execution Mode:** `ready-for-agent` (interactive CLI).

---

### Tier 2: Broken Core User Flows & Auth Perimeter Hardening (P1)

#### 4. [#41: Implement deep linking for winery share URLs (/winery/[id])](https://github.com/jarredb9/finger-lakes-app-57/issues/41)
- **Problem & Impact:** The "Share" button in `WineryActionsPresentational.tsx` generates links in the format `https://<domain>/winery/<winery-ID>`. Navigating to this URL currently yields a **404 Not Found**.
- **Root Cause:** Next.js App Router lacks a dynamic route handler for `/winery/[id]`.
- **Remediation:**
  - Implement `app/winery/[id]/page.tsx` with server-side auth checking.
  - Hydrate `initialWineryId` into `AppShell` and open the responsive modal tier (`DesktopWineryModal`, `TabletWinerySheet`, `MobileWineryDrawer`).
  - Fly Mapbox camera to resolved coordinates.
  - Sync address bar back to `/` on modal dismissal via `window.history.replaceState`.
- **Milestone:** Assigned to `v3.8.0`.

#### 5. [#88: security(auth): add HaveIBeenPwned k-anonymity leaked password check in sign-up and password reset](https://github.com/jarredb9/finger-lakes-app-57/issues/88)
- **Problem & Impact:** Supabase security advisor reports `auth_leaked_password_protection` ("Leaked Password Protection Disabled"). Free-tier Supabase does not include native HIBP checking, leaving the application vulnerable to credential stuffing with known breached passwords on signup and password reset.
- **Root Cause:** Absence of client- and server-side leaked password validation before account creation and password updates.
- **Remediation:**
  - Create `lib/utils/password-security.ts` with `isPasswordCompromised(password: string): Promise<boolean>` using Web Crypto SHA-1 and the HaveIBeenPwned k-anonymity range API (`https://api.pwnedpasswords.com/range/${prefix}`) with 3-second timeout and fail-open resilience.
  - Integrate into `components/signup-form.tsx` to block registration with breached passwords.
  - Integrate client-side check into `components/reset-password-form.tsx`.
  - Integrate server-side defense-in-depth into `app/api/auth/reset-password/route.ts` executed *before* `supabase.auth.exchangeCodeForSession(code)` so one-time recovery codes are never burned on rejected passwords.
  - Add comprehensive unit tests in `lib/utils/__tests__/password-security.test.ts` and `components/__tests__/auth-forms.test.tsx`.
- **Execution Mode:** `ready-for-agent`.

---

### Tier 3: Core UX Enablers & Milestone v3.8.0 Alignment

#### 6. [#50: Interactive Upcoming Trips Checklist in WineryModal](https://github.com/jarredb9/finger-lakes-app-57/issues/50)
- **Problem & Impact:** In the "Trip" tab of `WineryModal`, users cannot easily add a winery to an existing upcoming trip without manually picking a date from a date picker.
- **Remediation:** Replace date picker gate with an interactive upcoming trips checklist showing 1-tap `[+ Add]` and `[✕ Remove]` actions, optimistic toast feedback, and stop notes expansion.

#### 7. [#74: Support Visitor-confirmed Amenities & Decouple AI Vibe Tags](https://github.com/jarredb9/finger-lakes-app-57/issues/74)
- **Problem & Impact:** Gemini AI vibe tags frequently emit duplicate amenity phrases (`"Dog Friendly"`, `"EV Charging"`), causing visual contradictions between the modal header badges and the structured Amenities tab.
- **Remediation:**
  - Decouple AI vibe prompt instructions in `supabase/functions/_shared/gemini.ts` from structured facility attributes.
  - Allow on-site visitors logging a visit via `VisitForm` to confirm amenities to crowdsource missing Google data.

#### 8. [#47: Map Geolocation & Viewport Search UX ("Search This Area")](https://github.com/jarredb9/finger-lakes-app-57/issues/47)
- **Problem & Impact:** Users exploring the map have no one-touch way to center the map on their location or manually trigger a search of the currently visible bounding box.
- **Remediation:** Implement `useGeolocation` hook, top-center "Search This Area" dirty-viewport button, and map FAB location trigger.

---

### Tier 4: Foundational Architecture & Technical Debt

#### 9. [#61: Standardize coordinate utilities & contract legacy RPC dual-keys](https://github.com/jarredb9/finger-lakes-app-57/issues/61)
- **Prerequisites:** Issue #57 is **CLOSED**.
- **Scope:** Update `calculateDistance` in `lib/utils/geo.ts` to accept canonical `{ latitude, longitude }`, remove manual reshaping in `TripCardPresentational.tsx`, and contract obsolete `lat`/`lng` JSON keys in PostgreSQL RPC responses.
- **Execution Mode:** `agent:resolve` eligible.

#### 10. [#55: Deprecate and remove legacy asymmetric follows schema & RPCs](https://github.com/jarredb9/finger-lakes-app-57/issues/55)
- **Prerequisites:** None (ADR-0002 is fully adopted; #87 revokes schema grants on legacy follows tables).
- **Scope:** Cleanly drop obsolete `public.follows` and `public.follow_requests` tables, drop deprecated RPCs (`send_follow_request`, `respond_to_follow_request`), and regenerate TypeScript definitions.

#### 11. [#52: Epic: TypeScript Code Health & 'any' Type Remediation Roadmap](https://github.com/jarredb9/finger-lakes-app-57/issues/52)
- **Status:** Fast-track PR 1 (#53) is **CLOSED**.
- **Scope:** Execute PR 2 (Offline Crypto & Stores), PR 3 (Supabase SQL Migrations & Map Layer), and PR 4 (Component Polish) to eliminate unchecked `any` casts and enable automatic Supabase CLI type generation.
- **Milestone:** Assigned to `v3.8.0`.

#### 12. [#31: Component Maintainability & Architectural Decomposition](https://github.com/jarredb9/finger-lakes-app-57/issues/31)
- **Prerequisites:** Issues #36, #37, and #38 are **CLOSED**.
- **Scope:** Refactor 10 God Components (>250 LOC) mixing store logic, SDK bindings, and JSX into presentational/container sub-components with React 19 `useActionState` forms.
- **Milestone:** Assigned to `v3.8.0`.

---

### Tier 5: Strategic Platform Capabilities (Milestone v3.9.0)

#### 13. [#32: Google OAuth Authentication & Existing Account Linking](https://github.com/jarredb9/finger-lakes-app-57/issues/32)
- **Prerequisites:** Issues #35 and #36 are **CLOSED** (redirect cookie forwarding and `/privacy` route whitelisting implemented in `proxy.ts`).
- **Scope:** Supabase Auth Google provider integration with automatic linking for existing email/password accounts with matching email.
- **Milestone:** Assigned to `v3.9.0`.

#### 14. [#34: Winery Lifecycle & Rebranding Management](https://github.com/jarredb9/finger-lakes-app-57/issues/34)
- **Prerequisites:** Issue #35 (BE-07, BE-15) is **CLOSED**.
- **Scope:** Handle closed or rebranded wineries by introducing `business_status` (`OPERATIONAL`, `CLOSED_PERMANENTLY`, `ARCHIVED`) and `rebrand_history` JSONB tracking, preventing broken Place IDs while preserving user visit histories.
- **Milestone:** Assigned to `v3.9.0`.

#### 15. [#13: Advanced Markers & PostGIS-Powered Regional Guides](https://github.com/jarredb9/finger-lakes-app-57/issues/13)
- **Prerequisites:** Coordinate with #34 and #35.
- **Scope:** PostGIS-backed `regions` boundary polygons in Supabase and Mapbox custom HTML markers with status emblems (Visited, EV, Dogs).
- **Milestone:** Assigned to `v3.9.0`.

---

### Tier 6: Long-term Social & Discovery Backlog

#### 16. [#46: Feature: Social Visit Tagging & Shared History](https://github.com/jarredb9/finger-lakes-app-57/issues/46)
- **Scope:** `visit_participants` schema, atomic `log_visit_with_friends` RPC, friend picker UI in `VisitForm`, and mutual privacy enforcement.

#### 17. [#45: Feature: Taste Profiles & Smart Recommendations](https://github.com/jarredb9/finger-lakes-app-57/issues/45)
- **Scope:** Structured `taste_preferences` JSONB on profiles, `get_taste_matches` affinity scoring RPC, and recommendation badges.

#### 18. [#48: Feature: Community Discovery & Global Activity Feed](https://github.com/jarredb9/finger-lakes-app-57/issues/48)
- **Scope:** Realtime public activity stream with cursor pagination over `activity_ledger` and public feed UI.

---

## 4. Immediate Phasing & Execution Next Steps

```
Sprint Next Actions
 ├── Step 1: Fix #87 (Database Security & RLS Hardening) -> Drop dead RPCs, disable pg_graphql, enforce SECURITY INVOKER & catalog immutability (ready-for-agent)
 ├── Step 2: Fix #73 (Amenities Bug) -> Store version 3 bump & IndexedDB heal (agent:resolve)
 ├── Step 3: Fix #75 (PWA Hours Bug) -> shouldEnrich healing + Places client masks (ready-for-agent)
 ├── Step 4: Fix #41 (Deep Linking 404) -> Dynamic /winery/[id] route implementation (ready-for-agent)
 ├── Step 5: Implement #88 (HaveIBeenPwned Leaked Password Check) -> k-anonymity utility & form gates (ready-for-agent)
 │
Milestone v3.8.0 Burndown
 ├── Step 6: Implement #50 (WineryModal Upcoming Trips Checklist)
 ├── Step 7: Execute #52 (TypeScript Epic PR 2 & 3)
 └── Step 8: Execute #31 (Component Decomposition) -> Closes Milestone v3.8.0
 │
Database Hygiene Quick Wins
 ├── Step 9: Execute #61 (Coordinate standardizations)
 └── Step 10: Execute #55 (Drop deprecated follows schema)
 │
Milestone v3.9.0 Platform Features
 ├── Step 11: Implement #32 (Google OAuth & Account Linking)
 ├── Step 12: Implement #34 (Winery Lifecycle / Rebranding)
 └── Step 13: Implement #13 (Mapbox Markers & PostGIS Regions) -> Closes Milestone v3.9.0
```
