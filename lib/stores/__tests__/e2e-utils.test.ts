import { shouldSkipRealSync, isWebKitFallback } from '../e2e-utils';

describe('e2e-utils', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_IS_E2E = 'true';
    localStorage.clear();
    // @ts-ignore
    delete globalThis._E2E_ENABLE_REAL_SYNC;
    // @ts-ignore
    delete globalThis._E2E_WEBKIT_SYNC_FALLBACK;
  });

  describe('shouldSkipRealSync', () => {
    it('should return false if NOT in E2E mode', () => {
      process.env.NEXT_PUBLIC_IS_E2E = 'false';
      expect(shouldSkipRealSync()).toBe(false);
    });

    it('should return true if in E2E mode and nothing enabled', () => {
      expect(shouldSkipRealSync()).toBe(true);
    });

    it('should return false if enabled in localStorage', () => {
      localStorage.setItem('_E2E_ENABLE_REAL_SYNC', 'true');
      expect(shouldSkipRealSync()).toBe(false);
    });

    it('should return false if enabled in globalThis', () => {
      // @ts-ignore
      globalThis._E2E_ENABLE_REAL_SYNC = true;
      expect(shouldSkipRealSync()).toBe(false);
    });
  });

  describe('isWebKitFallback', () => {
    it('should return true if enabled in localStorage', () => {
      localStorage.setItem('_E2E_WEBKIT_SYNC_FALLBACK', 'true');
      expect(isWebKitFallback()).toBe(true);
    });

    it('should return true if enabled in globalThis', () => {
      // @ts-ignore
      globalThis._E2E_WEBKIT_SYNC_FALLBACK = true;
      expect(isWebKitFallback()).toBe(true);
    });

    it('should return false/undefined if not enabled', () => {
      expect(isWebKitFallback()).toBeFalsy();
    });
  });
});
