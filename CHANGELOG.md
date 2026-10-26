# Changelog

All notable changes to the Winery Visit Planner and Tracker are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> [!NOTE]
> Tooling release notes for `agent-resolve` are maintained separately in [scripts/agent-resolve/CHANGELOG.md](scripts/agent-resolve/CHANGELOG.md).

## [Unreleased] (v3.7.1)

### Security
* Restricted production secrets (`SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`) strictly to GitHub Actions `Production` deployment environments, removing exposure to pull request builds ([#97](https://github.com/jarredb9/finger-lakes-app-57/issues/97)).
* Added localhost hostname verification to database administration scripts to prevent execution against remote environments without `--allow-remote` ([#97](https://github.com/jarredb9/finger-lakes-app-57/issues/97)).
* Relocated production environment files outside mounted container runner trees and enforced `0600` permissions on local secrets ([#97](https://github.com/jarredb9/finger-lakes-app-57/issues/97)).
* Hardened Playwright container runner by replacing shell `eval` with positional array forwarding ([#97](https://github.com/jarredb9/finger-lakes-app-57/issues/97)).
* Parameterized GitHub Actions workflow inputs with regex validation to prevent expression injection ([#97](https://github.com/jarredb9/finger-lakes-app-57/issues/97)).

## [3.7.0] - 2026-10-23

### Added
* Multi-provider trip navigation scheme supporting Apple Maps, Google Maps, and Waze with accessible Radix dropdown selection ([#63](https://github.com/jarredb9/finger-lakes-app-57/issues/63), [#70](https://github.com/jarredb9/finger-lakes-app-57/pull/70), [ADR-0006](docs/adr/0006-containerized-ios-pwa-emulation-testing.md)).
* Containerized iOS PWA standalone mode emulation and Playwright WebKit test fixtures ([#71](https://github.com/jarredb9/finger-lakes-app-57/issues/71), [#72](https://github.com/jarredb9/finger-lakes-app-57/pull/72), [ADR-0006](docs/adr/0006-containerized-ios-pwa-emulation-testing.md)).
* Client-side full visit history evaluation with on-demand complete dataset fetching, multi-column sorting (Date, Rating, Winery Name), in-memory filtering, and responsive pagination in `VisitHistoryModal` ([ADR-0003](docs/adr/0003-client-side-visit-history-evaluation.md)).
* Haversine distance calculation and dynamic `FloatingSearchAreaButton` rendered when viewport center shifts >5 km from last searched bounds ([#44](https://github.com/jarredb9/finger-lakes-app-57/issues/44), [ADR-0004](docs/adr/0004-global-winery-scope-and-unrestricted-user-geolocation.md)).
* Tri-state operational status model (`Open Now`, `Closed`, and `Hours Unavailable`) with animated skeleton loading pills during pending enrichment ([#56](https://github.com/jarredb9/finger-lakes-app-57/issues/56)).
* On-demand Places API enrichment triggered when opening details for database-persisted wineries lacking operational hours ([#56](https://github.com/jarredb9/finger-lakes-app-57/issues/56)).
* Dismissible selected wineries badge list (`SelectedWineriesList`) in `TripForm` ([#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57)).
* Formally established global winery discovery scope and unrestricted user geolocation policy ([ADR-0004](docs/adr/0004-global-winery-scope-and-unrestricted-user-geolocation.md)).

### Changed
* Standardized trip navigation actions in `useTripActions` to canonical `handleTripNavigation(provider)` ([#71](https://github.com/jarredb9/finger-lakes-app-57/issues/71), [#72](https://github.com/jarredb9/finger-lakes-app-57/pull/72)).
* Switched trip navigation launching to synchronous window opening within the user gesture event loop to eliminate WebKit popup blocker suppression on iOS PWAs ([#63](https://github.com/jarredb9/finger-lakes-app-57/issues/63), [#70](https://github.com/jarredb9/finger-lakes-app-57/pull/70)).
* Refactored `use-winery-filter` to derive sidebar lists from the unified map winery collection filtered by active viewport bounds and category filters ([#44](https://github.com/jarredb9/finger-lakes-app-57/issues/44)).
* Decoupled top-level layout loading from winery detail enrichment, permitting cached data to render immediately with field-level loading indicators ([#56](https://github.com/jarredb9/finger-lakes-app-57/issues/56)).
* Upgraded Zustand persistence schema to version 2 with selective migration purging stale enriched records while preserving map markers ([#56](https://github.com/jarredb9/finger-lakes-app-57/issues/56)).
* Expanded `public.get_map_markers` RPC and Places API field masks to ingest ratings, review counts, and amenities under Places Basic SKU ([#44](https://github.com/jarredb9/finger-lakes-app-57/issues/44)).
* Refactored `TripForm` winery selection to declarative React Hook Form field bindings ([#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57)).
* Preserved session-backed modal state (`_PWA_ACTIVE_WINERY_ID`) across PWA updates to restore active modals seamlessly ([#56](https://github.com/jarredb9/finger-lakes-app-57/issues/56)).
* Delegated offline `'create_trip'` sync queue actions directly to `TripService.createTrip` for online/offline parity ([#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57)).

### Deprecated
* `handleExportToMaps` in `useTripActions` and trip card components in favor of `handleTripNavigation` ([#71](https://github.com/jarredb9/finger-lakes-app-57/issues/71), [#72](https://github.com/jarredb9/finger-lakes-app-57/pull/72)).

### Fixed
* Fixed false-closed winery status badges and runtime crashes caused by partial weekday hours arrays ([#56](https://github.com/jarredb9/finger-lakes-app-57/issues/56)).
* Fixed automatic wishlist entry clearing when logging a visit, and repaired boolean precedence in `standardizeWineryData` ([#54](https://github.com/jarredb9/finger-lakes-app-57/issues/54), [ADR-0001](docs/adr/0001-wishlist-cleared-on-visit.md)).
* Fixed null coordinate persistence during multi-stop trip creation by coalescing latitude and longitude keys across RPCs and client services ([#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57)).
* Fixed navigation popup blocking in WebKit standalone mode by eliminating asynchronous geolocation callback hops ([#63](https://github.com/jarredb9/finger-lakes-app-57/issues/63), [#70](https://github.com/jarredb9/finger-lakes-app-57/pull/70)).
* Fixed mobile install banner display leaks when running in standalone mode ([#71](https://github.com/jarredb9/finger-lakes-app-57/issues/71), [#72](https://github.com/jarredb9/finger-lakes-app-57/pull/72)).
* Fixed trip count desynchronization and flickering to "0 Wineries" on newly created trip cards ([#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57)).
* Fixed ghost visit persistence when data sources report unvisited status ([#44](https://github.com/jarredb9/finger-lakes-app-57/issues/44)).
* Fixed double-firing navigation export defect when clicking the navigation dropdown trigger button ([#63](https://github.com/jarredb9/finger-lakes-app-57/issues/63), [#70](https://github.com/jarredb9/finger-lakes-app-57/pull/70)).

### Security
* Enforced `search_path = public, pg_temp` and caller authorization check (`p_user_id = auth.uid()`) on `public.get_map_markers` RPC ([#44](https://github.com/jarredb9/finger-lakes-app-57/issues/44)).

## [3.6.0] - 2026-09-28

### Added
* Nominal branded types (`GooglePlaceId`, `WineryDbId`) and runtime constructors (`toGooglePlaceId`, `toWineryDbId`) with development warnings and non-throwing fallbacks ([#53](https://github.com/jarredb9/finger-lakes-app-57/issues/53)).
* Zero-assertion structural boundary parsers for opening hours, parking options, and accessibility attributes in `winery.ts` ([#53](https://github.com/jarredb9/finger-lakes-app-57/issues/53)).
* Offline photo reconstitution, preview URLs, and AES-GCM sync queue payload encryption in `visitStore` ([#39](https://github.com/jarredb9/finger-lakes-app-57/issues/39)).
* Rootless Podman container runner scripts (`run-jest-container.sh`, `run-e2e-container.sh`) for isolated execution on RHEL 8 hosts ([#39](https://github.com/jarredb9/finger-lakes-app-57/issues/39)).
* `AuthenticatedModalHost` with dynamic code-splitting and idle prefetching for heavy modal component trees ([#39](https://github.com/jarredb9/finger-lakes-app-57/issues/39), [#36](https://github.com/jarredb9/finger-lakes-app-57/issues/36)).
* App Router error boundary (`app/error.tsx`) and typed Server Actions (`app/actions/auth.ts`) consuming React 19 `useActionState` ([#39](https://github.com/jarredb9/finger-lakes-app-57/issues/39), [#36](https://github.com/jarredb9/finger-lakes-app-57/issues/36)).
* IndexedDB Dead Letter Queue (DLQ) with 7-day retention for unrecoverable sync payloads ([#43](https://github.com/jarredb9/finger-lakes-app-57/pull/43)).
* Covering btree indexes across relational tables (`visits`, `trip_wineries`, `trip_members`, `wineries`) and composite index on `activity_ledger` ([#42](https://github.com/jarredb9/finger-lakes-app-57/pull/42)).

### Changed
* Decomposed monolithic `tripStore` and `visitStore` into modular Zustand 5 slices under 300 LOC each ([#43](https://github.com/jarredb9/finger-lakes-app-57/pull/43)).
* Consolidated winery caching into canonical `wineryStore`, normalizing visit relationships to 3NF in `visitStore` ([#43](https://github.com/jarredb9/finger-lakes-app-57/pull/43)).
* Migrated winery search endpoint (`/api/wineries`) to Google Places API (New) V1 with field masking ([#42](https://github.com/jarredb9/finger-lakes-app-57/pull/42)).
* Inlined `is_visible_to_viewer` RLS policy function into the PostgreSQL query planner (`LANGUAGE sql STABLE`) ([#42](https://github.com/jarredb9/finger-lakes-app-57/pull/42)).
* Rewrote `get_map_markers` RPC to set-based hash joins, eliminating N+1 scalar subqueries ([#42](https://github.com/jarredb9/finger-lakes-app-57/pull/42)).
* Gated `@serwist/next` to production builds to unblock Turbopack development ([#39](https://github.com/jarredb9/finger-lakes-app-57/issues/39), [#36](https://github.com/jarredb9/finger-lakes-app-57/issues/36)).
* Extracted Mapbox GL stylesheet from root layout directly into `MapView` ([#39](https://github.com/jarredb9/finger-lakes-app-57/issues/39), [#36](https://github.com/jarredb9/finger-lakes-app-57/issues/36)).
* Upgraded `@playwright/test` to 1.63 and container base images to Ubuntu 24.04 noble ([#39](https://github.com/jarredb9/finger-lakes-app-57/issues/39)).
* Configured Jest worker memory limits (`workerIdleMemoryLimit: 512MB`) and eliminated `jest.resetModules()` anti-patterns ([#39](https://github.com/jarredb9/finger-lakes-app-57/issues/39)).
* Decomposed E2E test helpers and mock route managers into domain-specific modules under `e2e/fixtures/` and `e2e/helpers/` ([#39](https://github.com/jarredb9/finger-lakes-app-57/issues/39)).
* Parameterized activity ledger webhook notifications using Supabase Vault without hardcoded secrets ([#42](https://github.com/jarredb9/finger-lakes-app-57/pull/42)).

### Removed
* Redundant `wineryDataStore.ts` in favor of consolidated `wineryStore` ([#43](https://github.com/jarredb9/finger-lakes-app-57/pull/43)).
* Unused dependencies (`@dnd-kit/core`, `@dnd-kit/sortable`, `recharts`, `react-resizable-panels`, `input-otp`, `sonner`) and unreferenced Radix UI primitives ([#39](https://github.com/jarredb9/finger-lakes-app-57/issues/39), [#36](https://github.com/jarredb9/finger-lakes-app-57/issues/36)).
* Orphaned `update-gemini-summary` Edge Function and `tr_visits_gemini_summary` database trigger ([#42](https://github.com/jarredb9/finger-lakes-app-57/pull/42)).
* Legacy CommonJS `node-fetch@2` polyfill, standardizing on Node 24 native Fetch ([#40](https://github.com/jarredb9/finger-lakes-app-57/pull/40)).

### Fixed
* Eliminated runtime exceptions from malformed opening hours, invalid place IDs, and NaN review dates ([#53](https://github.com/jarredb9/finger-lakes-app-57/issues/53)).
* Enforced input key allowlisting on trip mutations to prevent unpermitted fields from polluting stores or sync payloads ([#53](https://github.com/jarredb9/finger-lakes-app-57/issues/53)).
* Fixed sync queue stalls by routing unrecoverable privacy mutations directly to the Dead Letter Queue ([#53](https://github.com/jarredb9/finger-lakes-app-57/issues/53)).
* Prevented MapView unmounting during pan/search errors, using non-destructive floating overlays ([#53](https://github.com/jarredb9/finger-lakes-app-57/issues/53)).
* Eliminated flaky test timeouts and `{ force: true }` clicks across the Playwright E2E suite ([#39](https://github.com/jarredb9/finger-lakes-app-57/issues/39)).
* Fixed session cookie forwarding in Server Component auth helpers ([#39](https://github.com/jarredb9/finger-lakes-app-57/issues/39), [#36](https://github.com/jarredb9/finger-lakes-app-57/issues/36)).
* Prevented optimistic store corruption and sync payload empty object enqueueing during network failures ([#40](https://github.com/jarredb9/finger-lakes-app-57/pull/40)).
* Preserved session cookies across `/login` redirects in `proxy.ts` ([#40](https://github.com/jarredb9/finger-lakes-app-57/pull/40)).
* Fixed StrictMode memory leaks by properly cleaning up Google Maps fallback listeners on teardown ([#39](https://github.com/jarredb9/finger-lakes-app-57/issues/39), [#36](https://github.com/jarredb9/finger-lakes-app-57/issues/36)).

### Security
* Revoked direct table `UPDATE` privileges on `public.wineries` from `anon` and `authenticated` roles, removing overly permissive RLS policies ([#40](https://github.com/jarredb9/finger-lakes-app-57/pull/40)).
* Restricted `public.bulk_upsert_wineries` RPC execution strictly to `service_role` ([#40](https://github.com/jarredb9/finger-lakes-app-57/pull/40)).
* Pinned `search_path = public, pg_temp` on `get_map_markers` RPC and enforced caller authorization ([#42](https://github.com/jarredb9/finger-lakes-app-57/pull/42)).
* Enforced secret scrubbing for API keys, PATs, and Bearer tokens across logging and error reporting ([#39](https://github.com/jarredb9/finger-lakes-app-57/issues/39)).
* Restricted internal auth confirmation endpoints (`app/api/auth/confirm-user`) to non-production environments with required secret headers ([#40](https://github.com/jarredb9/finger-lakes-app-57/pull/40)).
* Restricted Supabase Auth routes to `NetworkOnly` in Service Worker and purged auth caches on logout ([#39](https://github.com/jarredb9/finger-lakes-app-57/issues/39), [#36](https://github.com/jarredb9/finger-lakes-app-57/issues/36)).

## [3.5.0] - 2026-08-28

### Added
* Universal Google Maps Street View launcher using native Universal URLs for mobile app deep-linking and browser tabs.
* Accessible combobox keyboard navigation (ArrowDown/ArrowUp, Enter, Escape) in winery and place search inputs.
* Unified user profile dropdown menu (`UserNav`) across desktop sidebar and mobile header with direct navigation to Settings, Terms, Privacy, and PWA controls.
* Reusable combobox keyboard hook (`useComboboxKeyboard`) and presentational `PlaceAutocompleteSuggestionsList`.
* Presentational `MapSearchBar`, `MapFilterToggles`, and `MapLegendPopover` components.
* Dedicated `ExploreTabContent` and `HistoryTabContent` components to prevent full sidebar re-renders on map camera movement.
* `MobileNavBar` component isolating social badge subscriptions.

### Changed
* Decomposed `PlaceAutocomplete` to compose pure Places SDK normalizers and presentation components.
* Refactored `MapControls` into a container consuming `useWineryMapContext` and `useTripStore`, eliminating prop drilling.
* Streamlined `AppSidebar` into a lightweight layout orchestrator (<80 LOC).
* Extracted Mapbox layer configurations into `mapbox-layers.ts` and encapsulated fallback logic in `GoogleMapAdapter` and `GoogleMapFallback`.
* Updated Playwright test scripts and selectors for Mobile Safari and Mobile Chrome execution targets.

### Fixed
* Fixed `releasePointerCapture` DOM exceptions during synthetic touch event simulation.
* Fixed DOM `removeChild` errors in DatePicker during calendar selections and trip creation.
* Standardized date formatting with `formatDateLocal` across map filter toggles and trip selectors.
* Fixed false-positive review keyword matches in `WineryQnA` using strict regex word boundaries.

## [3.4.0] - 2026-08-25

### Added
* Reactive `useLayoutTier` hook classifying viewports into mobile (<768px), tablet (768px–1023px), and desktop (≥1024px).
* Tablet floating overlay drawer (`TabletFloatingDrawer`) preserving full-screen map canvas with collapsible pill mode.
* `TabletWinerySheet` responsive winery detail presentation for tablet viewports.
* Multi-viewport Playwright E2E test suite (`e2e/responsive-layout.spec.ts`) validating layout shifts across mobile, tablet, and desktop.

### Changed
* Standardized interactive touch targets across map controls to meet WCAG 2.5.5 minimum 44×44px sizing.
* Orchestrated `AppShell` rendering per layout tier with strict `data-state` contracts.

## [3.3.0] - 2026-08-24

### Changed
* Upgraded runtime environment and CI workflows to Node.js 24 LTS.
* Hardened asynchronous session token resolution tests under Node 24 microtask scheduling.
* Enhanced Playwright visual tests with animation suppression and font-loading readiness guards.
* Refactored trip sharing, deep linking, and sync E2E test flows with atomic state injection and CORS preflight handling.

## [3.2.0] - 2026-07-30

### Added
* Dedicated presentational components for winery details: `DesktopWineryModal`, `MobileWineryDrawer`, `WineryImage`, `AttributeStatus`, `WineryInfoCard`, `WineryAmenitiesList`, `WineryAiInsightsCard`, `HeroPhotoCarousel`, and `PhotoLightboxModal`.

### Changed
* Decomposed monolithic `winery-modal.tsx` and `WineryDetails.tsx` into modular subcomponents and the `use-winery-modal-state` hook.
* Streamlined `winery-modal.tsx` into a lightweight container and `WineryDetails.tsx` into a view-mode switcher.

### Fixed
* Fixed photo caching store mutation loop and stabilized Embla photo carousel initialization.
* Prevented photo carousel index reset during active slide transitions.
* Fixed ghost click bleed-through when dismissing photo lightbox in mobile drawer view.
* Fixed range slider thumb styling across WebKit and Firefox.
* Hid redundant scrollbars in `WineryInfoCard` on mobile viewports.
* Removed duplicate AI tasting notes banner from varietals tab when AI features are enabled.

## [3.1.0] - 2026-07-29

### Added
* Apple Maps-style multi-snap mobile drawer (`Peek`, `Half`, `Full`) with live operational status badges and gesture dismissal.
* Hero photo carousel with full-screen lightbox preview in winery modal.
* Real-time weather and outdoor tasting conditions widget (`WineryWeatherWidget`).
* Varietals and tasting profile tab with interactive flavor profile sliders (Dry ↔ Sweet, Light ↔ Full Body).
* Vibe and specialty badges horizontal scroller (e.g., Dog Friendly, EV Charging).
* User preference toggle in `/settings` to enable or disable AI features (defaulted to OFF).
* Varietal data extraction from review summaries in `update-gemini-summary` Edge Function.
* Database migrations adding `varietals` and `vibe_tags` to `wineries` and `ai_enabled` to `profiles`.

### Changed
* Refactored `winery-modal` and test suites to support multi-snap drawer states and AI toggle preferences.

### Security
* Updated dependencies and resolved `npm audit` security vulnerabilities.

## [3.0.0] - 2026-07-16

### Added
* Mapbox GL JS vector map rendering via `react-map-gl` with custom marker clustering.
* Floating map style switcher toggling between Outdoors and Streets basemaps.
* Immersive full-screen Google Street View integration accessible from winery details.
* "Powered by Google" floating attribution badge for Places API compliance.
* Offline vector tile and asset caching rules in Service Worker with storage quota management.

### Changed
* **Breaking Change:** Migrated primary map rendering engine from Google Maps JavaScript API (`@vis.gl/react-google-maps`) to Mapbox GL JS.
* **Breaking Change:** Required `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` environment variable for map rendering.
* Refactored `mapStore`, `use-winery-map`, and `use-winery-filter` to consume Mapbox camera states and serializable bounding boxes.

### Removed
* Removed `@vis.gl/react-google-maps` and `@googlemaps/markerclusterer` packages.
* Deleted legacy `GoogleMapsProvider` and `generic-marker-clusterer` components.

---

## Archive

For earlier releases, see the archived changelogs:
* [Version 2.x Releases (v2.0.0 – v2.13.3)](docs/changelogs/CHANGELOG-v2.md)
* [agent-resolve Tooling Releases](scripts/agent-resolve/CHANGELOG.md)

[Unreleased]: https://github.com/jarredb9/finger-lakes-app-57/compare/v3.7.0...HEAD
[3.7.0]: https://github.com/jarredb9/finger-lakes-app-57/compare/v3.6.0...v3.7.0
[3.6.0]: https://github.com/jarredb9/finger-lakes-app-57/compare/v3.5.0...v3.6.0
[3.5.0]: https://github.com/jarredb9/finger-lakes-app-57/compare/v3.4.0...v3.5.0
[3.4.0]: https://github.com/jarredb9/finger-lakes-app-57/compare/v3.3.0...v3.4.0
[3.3.0]: https://github.com/jarredb9/finger-lakes-app-57/compare/v3.2.0...v3.3.0
[3.2.0]: https://github.com/jarredb9/finger-lakes-app-57/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/jarredb9/finger-lakes-app-57/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/jarredb9/finger-lakes-app-57/compare/v2.13.3...v3.0.0
