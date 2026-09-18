/**
 * E2E TEST HELPERS - BACKWARD COMPATIBLE DELEGATION FAÇADE
 *
 * Decomposed into granular domain modules under e2e/helpers/:
 * - core.ts: Low-level driver primitives, DOM signaling, readiness signals, SW/cache cleanup
 * - navigation.ts: Responsive shell navigation, tab switching, and drawer expansion
 * - auth.ts: Authentication forms and login flows
 * - wineries.ts: Winery search, card interaction, drawer and modal state
 * - visits.ts: Visit logging and modal workflows
 * - social.ts: Social graph operations, friend requests, removal, sharing, and privacy
 * - assertions.ts: Custom store assertions and UI feedback signals
 * - diagnostics.ts: Deprecated state injection bypasses and store diagnostics
 */

export * from './helpers/index';
