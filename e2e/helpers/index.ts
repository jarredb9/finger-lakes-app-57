/**
 * E2E TEST HELPERS - BARREL EXPORT
 *
 * Consolidates all domain-specific helper modules:
 * - core: Driver primitives, DOM signaling, readiness signals, SW/cache cleanup
 * - navigation: Responsive navigation, tab switching, and drawer expansion
 * - auth: Authentication forms and login flows
 * - wineries: Winery search, card interaction, drawer and modal state
 * - visits: Visit logging and modal workflows
 * - social: Social graph operations, friend requests, removal, sharing, and privacy
 * - assertions: Custom store assertions and UI feedback signals
 * - diagnostics: State injection bypasses and store diagnostics
 */

export {
  getSidebarContainer,
  waitForSignal,
  waitForAppReady,
  waitForMapReady,
  dismissCookieConsent,
  clearServiceWorkers,
} from './core';

export {
  getTabTrigger,
  navigateToTab,
  navigateToSettings,
  ensureSidebarExpanded,
} from './navigation';

export {
  fillLoginForm,
  clickSignIn,
  submitLoginForm,
  login,
  loginProgrammatic,
} from './auth';

export {
  waitForSearchComplete,
  openWineryDetails,
  openWineryModalState,
  closeWineryModal,
} from './wineries';

export {
  logVisit,
} from './visits';

export {
  setupFriendship,
  removeFriend,
  closeShareDialog,
  selectPrivacyOption,
  refreshFriendsStore,
} from './social';

export {
  waitForToast,
  ensureProfileReady,
  expectTripInStore,
  expectTripDeletedFromStore,
  expectVisitInStore,
  expectVisitDeletedFromStore,
  expectWineryStatusInStore,
  expectWineryPrivacyInStore,
} from './assertions';

export {
  dumpStoreDiagnostics,
  injectTripState,
  injectVisitState,
  injectWineryState,
  injectSocialState,
} from './diagnostics';
