# Specification: PWA Resilience & Offline Integrity

## Overview
Enhance the application's PWA capabilities by implementing a robust offline mutation queue, improving storage quota management, and refining the update user experience. This track ensures that data remains consistent across network transitions and that user sessions are protected from abrupt reloads.

**CRITICAL MANDATE:** All development must follow the TDD workflow and adhere to the "The Reconstitution Rule" and "The Quota Resilience Rule" defined in `GEMINI.md`.

## Functional Requirements
1.  **State Management & Map Store Cleanup (Priority 0):**
    *   **Surgical Removal**: Remove the redundant `selectedTrip` and `setSelectedTrip` state from `lib/stores/mapStore.ts`. All components must defer exclusively to `tripStore`.
    *   **Orchestration**: Ensure `uiStore` explicitly calls `setSelectedTrip(null)` on trip-related modal closure to prevent stale state flashes.
2.  **Offline Mutation Queue:**
    *   **Scope**: Support offline creation/modification/deletion for Visits, Trips, Profile Settings, and Social Actions.
    *   **Persistence**: Store all pending mutations in an **Encrypted Queue** using IndexedDB (`idb-keyval`). 
    *   **Encryption**: Payloads must be encrypted at rest using a per-session or per-user key (e.g., Web Crypto API). Keys must be derived using **PBKDF2** from the `user.id`.
    *   **Sync Logic**: Implement an "Upload First" strategy. When the network returns, the app must replay and clear the mutation queue *before* refreshing state from the server.
    *   **Background Sync**: Utilize the `ServiceWorkerRegistration.sync` API to trigger background sync when the network is restored.
3.  **Binary Data Reconstitution (The Reconstitution Rule):**
    *   **Logic**: Strictly enforce the rule for all binary assets (Photos). 
    *   **WebKit Compatibility**: Store photos as **Base64 strings** in the offline queue (IndexedDB) to prevent detached Blob handles. Reconstitute as `File` objects immediately before the network request.
    *   **Implementation**: Utilize the standardized utilities in `lib/utils/sync-helpers.ts` (`stabilizePhotos` for queueing and `base64ToFile` for sync replay) to ensure consistent data reconstitution across all stores.
4.  **Refined Update UX:**
    *   **Logic**: Change SW update logic to `skipWaiting: false`. Apply updates only on the **Next Navigation** or user confirmation.
    *   **Loop Fix**: Explicitly handle the `controllerchange` event to prevent infinite update reloads.
5.  **Quota Management & Resilience:**
    *   **Strategy**: Maintain the aggressive `unhandledrejection` recovery logic in `sw.ts`.
    *   **Proactive Cleanup**: Silently purge `google-maps-tiles` and `static-assets` if browser usage exceeds 80%.
6.  **Offline Data Availability (Read-Only Mode):**
    *   **Mandate**: The application MUST NOT be blank when opened offline.
    *   **Logic**: Essential data (Visits, Trips, Favorite Wineries, and Friend Activity) must be selectively persisted to allow users to view their history and plans without a network connection.
    *   **Scope Expansion**:
        *   **wineryDataStore**: Persist the first 50 wineries in `persistentWineries` (Master Cache).
        *   **friendStore**: Persist the first page of `friendActivity` and the user's `friends` list.

## Technical Standards
1.  **Storage**: Use `idb-keyval` for the mutation queue and offline data cache.
2.  **Sync Hardening**: 
    *   **Hostname Normalization**: Service Worker interception MUST treat `localhost` and `127.0.0.1` as equivalent.
    *   **Non-Blocking Loop**: The sync process MUST NOT halt on individual mutation errors; failing items must be marked and the queue must proceed.
3.  **State Management**: Implement **`useSyncStore`** (Zustand) for reactive sync status.
4.  **ID Normalization**: Strictly enforce `Number()` conversion for all `WineryDbId` and Trip IDs during data retrieval (Service Layer) or store hydration.

## Acceptance Criteria
*   New SW version shows a toast instead of a force-reload.
*   Updating a visit while offline stores an encrypted record in the `SyncStore`.
*   **Offline Visibility**: Refreshing the app while offline preserves visibility of recently fetched visits and trips.
*   **Queue Resilience**: A single failing mutation (e.g., 400/500 from server) does not block subsequent mutations in the queue from syncing.
*   Photos taken offline are stored as Base64 and successfully uploaded as `File` objects.
fline stores an encrypted record in the `SyncStore`.
*   **Offline Visibility**: Refreshing the app while offline preserves visibility of recently fetched visits and trips.
*   **Queue Resilience**: A single failing mutation (e.g., 400/500 from server) does not block subsequent mutations in the queue from syncing.
*   Photos taken offline are stored as Base64 and successfully uploaded as `File` objects.
