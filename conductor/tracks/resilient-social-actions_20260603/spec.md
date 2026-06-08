# Specification: Resilient Social Actions

## Overview
This track focuses on reinforcing the resilience and data integrity of core user interactions (`log_visit`, `update_visit`, `create_trip`) under offline PWA conditions, while enabling extensible backend side-effects (AI-driven winery summary updates and social notifications) using native Supabase Database Webhooks. 

Following the **Selective Migration Mandate**, core relational writes remain as high-performance PostgreSQL RPCs, avoiding the latency, cold-start, and database-connection overhead of Edge Functions. Background side-effects are decoupled using native, asynchronous Database Webhooks.

---

## 1. Functional Requirements

### A. Idempotent Core Writes (PostgreSQL RPCs)
To prevent duplicate records from client-side retries after network timeouts:
* Extend the `public.visits` and `public.trips` tables to support an optional `idempotency_key` (UUID) column with a `UNIQUE` constraint.
* Generate a client-side UUID (the `idempotency_key`) at the beginning of the `saveVisit`, `updateVisit`, and `createTrip` actions.
* Pass this key directly to the database RPC for direct online writes, and include it in the `SyncItem` payload (using it as `SyncItem.id` when enqueuing) so it is preserved across network retries.
* If a write attempt encounters a unique constraint violation on `idempotency_key` (or if checking for existence before writing finds the key already applied), the database RPC must handle the conflict gracefully:
  - For `log_visit` / `create_trip` / `create_trip_with_winery`: Return the existing row ID(s) instead of throwing an error or inserting a duplicate.
  - For `update_visit`: Return the updated row ID safely.

### B. Decoupled Asynchronous Side-Effects (Database Webhooks)
Instead of polling database queues with cron daemons, use native **Supabase Database Webhooks** to trigger Edge Functions asynchronously:
1. **AI Gemini Winery Summary Updates:**
   - Create a database webhook on `public.visits` that triggers AFTER INSERT or UPDATE.
   - The webhook filter ensures the hook only fires if `user_review` length is updated and is greater than 100 characters.
   - The webhook invokes an `update-gemini-summary` Edge Function asynchronously to generate and save a winery summary.
2. **Privacy-Aware Social Notifications:**
   - Create a database webhook on `public.activity_ledger` that triggers AFTER INSERT.
   - Since the database trigger `tr_visits_activity_ledger` automatically creates ledger records, this webhook will fire for all new public or friend-visible social actions.
   - The webhook invokes a `send-social-notification` Edge Function asynchronously.
   - The function will verify privacy settings (using `is_visible_to_viewer`) and dispatch notifications (push notifications or badges) to eligible friends.

### C. PWA Client Resilience & Quota Safeguards
* **Base64 Photo Persistence:** Since file/blob handles can detach in IndexedDB under WebKit, all photos logged offline must be serialized to Base64 in `SyncItem` payloads.
* **Image Compression:** Before Base64 serialization, compress and resize photos client-side to a maximum dimension of 2048px using a lightweight canvas utility (`lib/utils/image.ts`) to protect upload bandwidth and storage quota.
* **IndexedDB Quota Safety:** Catch `QuotaExceededError` write failures in the storage layer (`idbStorage.setItem` and `persistToIdb`). On failure, run a proactive cleanup of local cache (`checkAndCleanupQuota(0.8)`) and retry once. If writes continue to fail, dispatch a `quota-exceeded-warning` custom window event.
* **Decoupled Quota UI:** Listen to `quota-exceeded-warning` in `components/pwa-handler.tsx` and show a toast notifying the user that offline changes cannot be saved.
* **Zustand Reset on Logout:** On user logout, clear all cached and persistent data in IndexedDB/localStorage by resetting all 9 Zustand stores. The async `useSyncStore.getState().reset()` must be explicitly awaited first to ensure the offline sync queue is entirely deleted before the session ends.

---

## 2. Technical Mandates

### A. Database Schema Backwards-Compatibility
* Migrations must use the expand-and-contract pattern. Do not alter, modify, or drop existing RPC arguments until the client-side store refactoring is verified and deployed. 

### B. Security Definer & RLS
* Ensure the Database Webhooks are secure and database RPCs enforce `auth.uid()` checks.
* RLS policies on `visits`, `trips`, and `activity_ledger` must remain active and secure.

### C. Local Date Stability
* Database RPCs and Edge Functions must process and store dates (`visit_date`, `trip_date`) as timezone-safe calendar date literals (Postgres `date` type, standard `YYYY-MM-DD` strings) to prevent offset shifts.

### D. E2E Network Mocking
* Playwright tests simulating offline states must use a hybrid approach combining context offline setting (`context.setOffline(true)`) with explicit route intercepts (`context.route`) to reliably intercept Service Worker network fetches.
