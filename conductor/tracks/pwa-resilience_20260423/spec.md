# Specification: PWA Resilience & Offline Integrity

## Overview
Enhance the application's PWA capabilities by implementing a robust offline mutation queue, improving storage quota management, and refining the update user experience. This track ensures that data remains consistent across network transitions and that user sessions are protected from abrupt reloads.

**CRITICAL MANDATE:** All development must follow the TDD workflow and adhere to the "The Reconstitution Rule" and "The Quota Resilience Rule" defined in `GEMINI.md`.

## Functional Requirements
1.  **Offline Mutation Queue:**
    *   **Scope**: Support offline creation/modification/deletion for Visits, Trips, Profile Settings, and Social Actions.
    *   **Persistence**: Store all pending mutations in an **Encrypted Queue** using IndexedDB (`idb-keyval`). 
    *   **Encryption**: Payloads must be encrypted at rest using a per-session or per-user key (e.g., Web Crypto API).
    *   **Sync Logic**: Implement an "Upload First" strategy. When the network returns, the app must replay and clear the mutation queue *before* refreshing state from the server.
    *   **Conflict Resolution**: Use a "Last Write Wins" strategy for v1.
2.  **Binary Data Reconstitution:**
    *   **Logic**: Strictly enforce the "Reconstitution Rule" for all binary assets (Winery photos, Visit photos, Profile images).
    *   **Process**: Convert `File` objects to Base64 strings for storage in the offline queue. Reconstitute as `File` objects immediately before the sync request.
3.  **Refined Update UX:**
    *   **Policy**: Change Service Worker update logic to `skipWaiting: false`.
    *   **UI**: Implement a toast notification when a new version is detected.
    *   **Logic**: Apply updates (via `SKIP_WAITING`) only when the user clicks "Update" or on the **Next Navigation** after the toast appears. This prevents data loss during active form entry.
    *   **Loop Fix**: Explicitly handle the `controllerchange` event to prevent infinite update popups.
4.  **Quota Management & Resilience:**
    *   **Strategy**: Maintain the aggressive `unhandledrejection` recovery logic in `sw.ts`.
    *   **Proactive Cleanup**: Silently clear the `google-maps-tiles` cache if the browser reports `usage > 80%` of `quota`.
    *   **UI**: Cleanup remains **Silent**; no storage warnings will be shown to the user unless the app becomes critically non-functional.
5.  **Hydration & State Stability:**
    *   **DnD Rule**: Wrap all Drag-and-Drop contexts in `mounted` checks to prevent SSR hydration errors.
    *   **Modal Reset Rule**: Explicitly nullify feature-specific state on modal closure to prevent UI flashes.

## Technical Standards
1.  **Storage**: Use `idb-keyval` for the mutation queue.
2.  **Encryption**: Utilize the browser-native **Web Crypto API** (AES-GCM) for queue encryption.
3.  **Background Sync**: Utilize the `ServiceWorkerRegistration.sync` API where supported; fallback to a "Window Focus" or "Navigator Online" listener for broad cross-browser support (WebKit).
4.  **Store Integration**: Integrate the sync bridge directly into `wineryDataStore` and `visitStore`.

## Acceptance Criteria
*   New SW version shows a toast instead of a force-reload.
*   Update popup loop is resolved and only appears once per update.
*   Updating a visit while offline stores a record in the encrypted IndexedDB queue.
*   Photos taken offline are stored as Base64 and successfully uploaded as `File` objects upon reconnection.
*   Reconnecting to the network triggers an "Upload First" sequence that clears the queue before fetching new data.
*   Closing the tab with pending mutations preserves the queue for the next session.
*   Storage usage above 80% triggers a background tile cache purge without user intervention.
*   Next.js 16 hydration errors related to DnD are resolved.
*   Modal closure properly resets all active entity state.
