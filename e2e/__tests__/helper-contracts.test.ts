import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import * as helpers from '../helpers';

/**
 * Phase 8 Task 1 (Red Phase): Granular Domain Helper Contract Parity Tests
 *
 * Verifies:
 * 1. Modular Domain Helper Directory and File Architecture under e2e/helpers/
 * 2. Domain Module Export Signatures across all 8 modules (38 functions)
 * 3. 100% Export Parity between directory resolution ('../helpers') and e2e/helpers/index.ts
 * 4. Domain Invariant Function Signatures and Parameter Contracts
 */
test.describe('Granular Domain Helpers Contract Parity (Phase 8)', () => {
  const helpersDir = path.resolve(__dirname, '../helpers');
  const coreFile = path.join(helpersDir, 'core.ts');
  const navigationFile = path.join(helpersDir, 'navigation.ts');
  const authFile = path.join(helpersDir, 'auth.ts');
  const wineriesFile = path.join(helpersDir, 'wineries.ts');
  const visitsFile = path.join(helpersDir, 'visits.ts');
  const socialFile = path.join(helpersDir, 'social.ts');
  const assertionsFile = path.join(helpersDir, 'assertions.ts');
  const diagnosticsFile = path.join(helpersDir, 'diagnostics.ts');
  const indexFile = path.join(helpersDir, 'index.ts');

  const EXPECTED_CORE_EXPORTS = [
    'getSidebarContainer',
    'waitForSignal',
    'waitForAppReady',
    'waitForMapReady',
    'dismissCookieConsent',
    'clearServiceWorkers',
  ];

  const EXPECTED_NAVIGATION_EXPORTS = [
    'getTabTrigger',
    'navigateToTab',
    'navigateToSettings',
    'ensureSidebarExpanded',
  ];

  const EXPECTED_AUTH_EXPORTS = [
    'fillLoginForm',
    'clickSignIn',
    'submitLoginForm',
    'login',
    'loginProgrammatic',
  ];

  const EXPECTED_WINERIES_EXPORTS = [
    'waitForSearchComplete',
    'openWineryDetails',
    'openWineryModalState',
    'closeWineryModal',
  ];

  const EXPECTED_VISITS_EXPORTS = [
    'logVisit',
  ];

  const EXPECTED_SOCIAL_EXPORTS = [
    'setupFriendship',
    'removeFriend',
    'closeShareDialog',
    'selectPrivacyOption',
    'refreshFriendsStore',
  ];

  const EXPECTED_ASSERTIONS_EXPORTS = [
    'waitForToast',
    'ensureProfileReady',
    'expectTripInStore',
    'expectTripDeletedFromStore',
    'expectVisitInStore',
    'expectVisitDeletedFromStore',
    'expectWineryStatusInStore',
    'expectWineryPrivacyInStore',
  ];

  const EXPECTED_DIAGNOSTICS_EXPORTS = [
    'dumpStoreDiagnostics',
    'injectTripState',
    'injectVisitState',
    'injectWineryState',
    'injectSocialState',
  ];

  const ALL_38_HELPER_EXPORTS = [
    ...EXPECTED_CORE_EXPORTS,
    ...EXPECTED_NAVIGATION_EXPORTS,
    ...EXPECTED_AUTH_EXPORTS,
    ...EXPECTED_WINERIES_EXPORTS,
    ...EXPECTED_VISITS_EXPORTS,
    ...EXPECTED_SOCIAL_EXPORTS,
    ...EXPECTED_ASSERTIONS_EXPORTS,
    ...EXPECTED_DIAGNOSTICS_EXPORTS,
  ];

  test.describe('Modular Helper Directory & File Architecture Contract (Phase 8 Target)', () => {
    test('e2e/helpers directory exists', () => {
      expect(fs.existsSync(helpersDir) && fs.statSync(helpersDir).isDirectory(), 'e2e/helpers directory must exist').toBe(true);
    });

    test('e2e/helpers/core.ts exists', () => {
      expect(fs.existsSync(coreFile), 'core.ts must exist under e2e/helpers/').toBe(true);
    });

    test('e2e/helpers/navigation.ts exists', () => {
      expect(fs.existsSync(navigationFile), 'navigation.ts must exist under e2e/helpers/').toBe(true);
    });

    test('e2e/helpers/auth.ts exists', () => {
      expect(fs.existsSync(authFile), 'auth.ts must exist under e2e/helpers/').toBe(true);
    });

    test('e2e/helpers/wineries.ts exists', () => {
      expect(fs.existsSync(wineriesFile), 'wineries.ts must exist under e2e/helpers/').toBe(true);
    });

    test('e2e/helpers/visits.ts exists', () => {
      expect(fs.existsSync(visitsFile), 'visits.ts must exist under e2e/helpers/').toBe(true);
    });

    test('e2e/helpers/social.ts exists', () => {
      expect(fs.existsSync(socialFile), 'social.ts must exist under e2e/helpers/').toBe(true);
    });

    test('e2e/helpers/assertions.ts exists', () => {
      expect(fs.existsSync(assertionsFile), 'assertions.ts must exist under e2e/helpers/').toBe(true);
    });

    test('e2e/helpers/diagnostics.ts exists', () => {
      expect(fs.existsSync(diagnosticsFile), 'diagnostics.ts must exist under e2e/helpers/').toBe(true);
    });

    test('e2e/helpers/index.ts exists', () => {
      expect(fs.existsSync(indexFile), 'index.ts must exist under e2e/helpers/').toBe(true);
    });
  });

  test.describe('Domain Module Export Signatures Contract', () => {
    test('core.ts exports all expected low-level and driver primitives', async () => {
      if (!fs.existsSync(coreFile)) {
        test.skip(!fs.existsSync(coreFile), 'core.ts not yet implemented');
        return;
      }
      const mod = await import(coreFile);
      for (const fnName of EXPECTED_CORE_EXPORTS) {
        expect(typeof mod[fnName], `core.ts must export function ${fnName}`).toBe('function');
      }
    });

    test('navigation.ts exports all expected responsive navigation helpers', async () => {
      if (!fs.existsSync(navigationFile)) {
        test.skip(!fs.existsSync(navigationFile), 'navigation.ts not yet implemented');
        return;
      }
      const mod = await import(navigationFile);
      for (const fnName of EXPECTED_NAVIGATION_EXPORTS) {
        expect(typeof mod[fnName], `navigation.ts must export function ${fnName}`).toBe('function');
      }
    });

    test('auth.ts exports all expected authentication flow helpers', async () => {
      if (!fs.existsSync(authFile)) {
        test.skip(!fs.existsSync(authFile), 'auth.ts not yet implemented');
        return;
      }
      const mod = await import(authFile);
      for (const fnName of EXPECTED_AUTH_EXPORTS) {
        expect(typeof mod[fnName], `auth.ts must export function ${fnName}`).toBe('function');
      }
    });

    test('wineries.ts exports all expected winery drawer and search helpers', async () => {
      if (!fs.existsSync(wineriesFile)) {
        test.skip(!fs.existsSync(wineriesFile), 'wineries.ts not yet implemented');
        return;
      }
      const mod = await import(wineriesFile);
      for (const fnName of EXPECTED_WINERIES_EXPORTS) {
        expect(typeof mod[fnName], `wineries.ts must export function ${fnName}`).toBe('function');
      }
    });

    test('visits.ts exports all expected visit logging workflows', async () => {
      if (!fs.existsSync(visitsFile)) {
        test.skip(!fs.existsSync(visitsFile), 'visits.ts not yet implemented');
        return;
      }
      const mod = await import(visitsFile);
      for (const fnName of EXPECTED_VISITS_EXPORTS) {
        expect(typeof mod[fnName], `visits.ts must export function ${fnName}`).toBe('function');
      }
    });

    test('social.ts exports all expected social graph and privacy helpers', async () => {
      if (!fs.existsSync(socialFile)) {
        test.skip(!fs.existsSync(socialFile), 'social.ts not yet implemented');
        return;
      }
      const mod = await import(socialFile);
      for (const fnName of EXPECTED_SOCIAL_EXPORTS) {
        expect(typeof mod[fnName], `social.ts must export function ${fnName}`).toBe('function');
      }
    });

    test('assertions.ts exports all expected custom store and feedback assertions', async () => {
      if (!fs.existsSync(assertionsFile)) {
        test.skip(!fs.existsSync(assertionsFile), 'assertions.ts not yet implemented');
        return;
      }
      const mod = await import(assertionsFile);
      for (const fnName of EXPECTED_ASSERTIONS_EXPORTS) {
        expect(typeof mod[fnName], `assertions.ts must export function ${fnName}`).toBe('function');
      }
    });

    test('diagnostics.ts exports all expected state injectors and diagnostic tools', async () => {
      if (!fs.existsSync(diagnosticsFile)) {
        test.skip(!fs.existsSync(diagnosticsFile), 'diagnostics.ts not yet implemented');
        return;
      }
      const mod = await import(diagnosticsFile);
      for (const fnName of EXPECTED_DIAGNOSTICS_EXPORTS) {
        expect(typeof mod[fnName], `diagnostics.ts must export function ${fnName}`).toBe('function');
      }
    });
  });

  test.describe('Directory Resolution & Export Parity Contract', () => {
    test('directory import "../helpers" resolves to index.ts and exports all 38 expected helper functions', () => {
      expect(ALL_38_HELPER_EXPORTS).toHaveLength(38);
      for (const fnName of ALL_38_HELPER_EXPORTS) {
        expect(typeof (helpers as Record<string, unknown>)[fnName], `../helpers must export ${fnName}`).toBe('function');
      }
    });

    test('e2e/helpers/index.ts exports all 38 expected helper functions', async () => {
      if (!fs.existsSync(indexFile)) {
        test.skip(!fs.existsSync(indexFile), 'e2e/helpers/index.ts not yet implemented');
        return;
      }
      const mod = await import(indexFile);
      for (const fnName of ALL_38_HELPER_EXPORTS) {
        expect(typeof mod[fnName], `e2e/helpers/index.ts must export function ${fnName}`).toBe('function');
      }
    });

    test('clean export keys of "../helpers" match expected 38 canonical helper functions', () => {
      const isMetaKey = (k: string) => k === '__esModule' || k === 'default' || k === 'module.exports';
      const keys = Object.keys(helpers).filter(k => !isMetaKey(k)).sort();
      expect(keys).toEqual([...ALL_38_HELPER_EXPORTS].sort());
      expect(keys).toHaveLength(38);
    });
  });

  test.describe('Domain Invariant Function Signatures & Parameter Contracts', () => {
    test('core helpers declare expected arity and parameter signatures', () => {
      expect(helpers.getSidebarContainer.length).toBeGreaterThanOrEqual(1);
      expect(helpers.waitForSignal.length).toBeGreaterThanOrEqual(2);
      expect(helpers.waitForAppReady.length).toBeGreaterThanOrEqual(1);
      expect(helpers.waitForMapReady.length).toBeGreaterThanOrEqual(1);
      expect(helpers.dismissCookieConsent.length).toBeGreaterThanOrEqual(1);
      expect(helpers.clearServiceWorkers.length).toBeGreaterThanOrEqual(1);
    });

    test('navigation helpers declare expected arity and parameter signatures', () => {
      expect(helpers.getTabTrigger.length).toBeGreaterThanOrEqual(2);
      expect(helpers.navigateToTab.length).toBeGreaterThanOrEqual(2);
      expect(helpers.navigateToSettings.length).toBeGreaterThanOrEqual(1);
      expect(helpers.ensureSidebarExpanded.length).toBeGreaterThanOrEqual(1);
    });

    test('auth helpers declare expected arity and parameter signatures', () => {
      expect(helpers.fillLoginForm.length).toBeGreaterThanOrEqual(3);
      expect(helpers.clickSignIn.length).toBeGreaterThanOrEqual(1);
      expect(helpers.submitLoginForm.length).toBeGreaterThanOrEqual(3);
      expect(helpers.login.length).toBeGreaterThanOrEqual(3);
      expect(helpers.loginProgrammatic.length).toBeGreaterThanOrEqual(3);
    });

    test('winery helpers declare expected arity and parameter signatures', () => {
      expect(helpers.waitForSearchComplete.length).toBeGreaterThanOrEqual(1);
      expect(helpers.openWineryDetails.length).toBeGreaterThanOrEqual(2);
      expect(helpers.openWineryModalState.length).toBeGreaterThanOrEqual(1);
      expect(helpers.closeWineryModal.length).toBeGreaterThanOrEqual(1);
    });

    test('visit helpers declare expected arity and parameter signatures', () => {
      expect(helpers.logVisit.length).toBeGreaterThanOrEqual(2);
    });

    test('social helpers declare expected arity and parameter signatures', () => {
      expect(helpers.setupFriendship.length).toBeGreaterThanOrEqual(4);
      expect(helpers.removeFriend.length).toBeGreaterThanOrEqual(2);
      expect(helpers.closeShareDialog.length).toBeGreaterThanOrEqual(1);
      expect(helpers.selectPrivacyOption.length).toBeGreaterThanOrEqual(2);
      expect(helpers.refreshFriendsStore.length).toBeGreaterThanOrEqual(1);
    });

    test('custom assertion helpers declare expected arity and parameter signatures', () => {
      expect(helpers.waitForToast.length).toBeGreaterThanOrEqual(2);
      expect(helpers.ensureProfileReady.length).toBeGreaterThanOrEqual(1);
      expect(helpers.expectTripInStore.length).toBeGreaterThanOrEqual(2);
      expect(helpers.expectTripDeletedFromStore.length).toBeGreaterThanOrEqual(2);
      expect(helpers.expectVisitInStore.length).toBeGreaterThanOrEqual(2);
      expect(helpers.expectVisitDeletedFromStore.length).toBeGreaterThanOrEqual(2);
      expect(helpers.expectWineryStatusInStore.length).toBeGreaterThanOrEqual(4);
      expect(helpers.expectWineryPrivacyInStore.length).toBeGreaterThanOrEqual(4);
    });

    test('diagnostic and injection helpers declare expected arity and parameter signatures', () => {
      expect(helpers.dumpStoreDiagnostics.length).toBeGreaterThanOrEqual(1);
      expect(helpers.injectTripState.length).toBeGreaterThanOrEqual(2);
      expect(helpers.injectVisitState.length).toBeGreaterThanOrEqual(2);
      expect(helpers.injectWineryState.length).toBeGreaterThanOrEqual(2);
      expect(helpers.injectSocialState.length).toBeGreaterThanOrEqual(2);
    });
  });
});
