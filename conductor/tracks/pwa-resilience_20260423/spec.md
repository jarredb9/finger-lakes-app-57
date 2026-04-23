# Specification: PWA Resilience & Offline Integrity

## Overview
Enhance the application's PWA capabilities by implementing a robust offline mutation queue, improving storage quota management, and refining the update user experience. This track ensures that data remains consistent across network transitions and that user sessions are protected from abrupt reloads.

**CRITICAL MANDATE:** All development must follow the TDD workflow and adhere to the "The Reconstitution Rule" and "The Quota Resilience Rule" defined in `GEMINI.md`.

## Functional Requirements
1.  **Offline Mutation Queue:**
    *   **Scope**: Support offline creation/modification/deletion for Visits, Trips, Profile Settings, and Social Actions.
    *   **Persistence**: Store all pending mutations in an **Encrypted Queue** using IndexedDB (`idb-keyval`). 
    *   **Encryption**: Payloads must be encrypted at rest using a per-session or per-user key (e.g., Web Crypto API). Keys must be derived using **PBKDF2** from the `user.id`.
    *   **Sync Logic**: Implement an "Upload First" strategy. When the network returns, the app must replay and clear the mutation queue *before* refreshing state from the server.
    *   **Conflict Resolution**: Use a "Last Write Wins" strategy for v1. In cases of unrecoverable failures (e.g., resource deleted on server but modified offline), implement a "Discard & Notify" policy: notify the user via a persistent toast and discard the mutation to prevent queue blockage.
    *   **Background Sync**: Utilize the `ServiceWorkerRegistration.sync` API to trigger background sync when the network is restored, ensuring mutations are replayed even if the tab is closed.
2.  **Binary Data Reconstitution**:
    *   **Logic**: Strictly enforce the "Reconstitution Rule" for all binary assets (Winery photos, Visit photos, Profile images).
    *   **Process**: Convert `File` objects to Base64 strings for storage in the offline queue. Reconstitute as `File` objects immediately before the sync request to ensure standard `multipart/form-data` compatibility.
3.  **Refined Update UX:**
    *   **Policy**: Change Service Worker update logic to `skipWaiting: false`.
    *   **UI**: Implement a toast notification when a new version is detected.
    *   **Logic**: Apply updates (via `SKIP_WAITING`) only when the user clicks "Update" or on the **Next Navigation** after the toast appears. This prevents data loss during active form entry.
    *   **Loop Fix**: Explicitly handle the `controllerchange` event in `navigator.serviceWorker` to prevent infinite update reloads.
4.  **Quota Management & Resilience:**
    *   **Strategy**: Maintain the aggressive `unhandledrejection` recovery logic in `sw.ts`.
    *   **Proactive Cleanup**: Silently purge caches if the browser reports `usage > 80%` of `quota` using a **Tiered Strategy**:
        1. `google-maps-tiles` (Ephemeral)
        2. `static-assets` (CacheFirst)
        3. `pages` (StaleWhileRevalidate)
        4. `supabase-storage` (Images - Last Resort)
    *   **UI**: Cleanup remains **Silent**; no storage warnings will be shown to the user unless the app becomes critically non-functional.
5.  **Hydration & State Stability:**
    *   **DnD Rule**: Wrap all Drag-and-Drop contexts in `mounted` checks to prevent SSR hydration errors in Next.js 16.
    *   **Modal Reset Rule**: Orchestrate a **Cross-Store Reset**. `uiStore` must explicitly call `reset()` or clear state in `tripStore` and `visitStore` on modal closure. Specifically, `selectedTrip` must be cleared to prevent stale state flashes.
    *   **ID Normalization**: Strictly enforce `Number()` conversion for all `WineryDbId` values during store ingestion and hydration.

## Technical Standards
1.  **Storage**: Use `idb-keyval` for the mutation queue.
2.  **State Management**: Refactor `offline-queue.ts` into a Zustand-managed **`useSyncStore`** to provide reactive sync status and mutation count to the UI.
3.  **Encryption**: Utilize the browser-native **Web Crypto API** (AES-GCM). Derivation keys MUST be tied to the `user.id` using PBKDF2 with a project-specific salt.
4.  **Sync Bridge**: Centralize replay logic in a dedicated **`SyncService`**. Avoid bloating entity stores (Visit/Trip) with sync orchestration.
5.  **Background Sync**: Utilize the `ServiceWorkerRegistration.sync` API; fallback to a "Window Focus" or "Navigator Online" listener for broad cross-browser support (WebKit).
6.  **Update Guarding**: Implement a `globalThis._PWA_UPDATING` flag and wait for the `controllerchange` event in `usePwa` to prevent infinite reload loops.

## Acceptance Criteria
*   New SW version shows a toast instead of a force-reload.
*   Update popup loop is resolved via `controllerchange` guarding.
*   Updating a visit while offline stores an encrypted record in the IndexedDB-backed `SyncStore`.
*   Photos taken offline are stored as Base64 and successfully uploaded as `File` objects upon reconnection.
*   Reconnecting to the network triggers an "Upload First" sequence via `SyncService` that clears the queue before fetching new data.
*   Numeric IDs (`WineryDbId`) are strictly normalized using `Number()` during store hydration and sync replay.
*   Closing the tab with pending mutations preserves the encrypted queue for the next session.
*   Storage usage above 80% triggers a background tile cache purge without user intervention.
*   Next.js 16 hydration errors related to DnD are resolved.
*   Modal closure properly resets all active entity state in `uiStore`, `tripStore`, and `visitStore`.
