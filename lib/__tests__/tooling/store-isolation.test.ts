import fs from 'fs';
import path from 'path';

describe('Store Isolation & Engine Window Detachment (Phase 4 Task 1 - Red Phase)', () => {
  const originalEnv = process.env.NEXT_PUBLIC_IS_E2E;

  afterEach(() => {
    process.env.NEXT_PUBLIC_IS_E2E = originalEnv;
  });

  const clearWindowStores = () => {
    if (typeof window !== 'undefined') {
      delete window.useFriendStore;
      delete window.useMapStore;
      delete window.useSyncStore;
      delete window.useTripStore;
      delete window.useUIStore;
      delete window.useUserStore;
      delete window.useVisitStore;
      delete window.useWineryStore;
      delete window.useWineryDataStore;
      delete window.idbKeyVal;
    }
  };

  describe('Dynamic JSDOM Store Window Exposure Gating', () => {
    it('asserts stores are NOT attached to window in production/default mode (NEXT_PUBLIC_IS_E2E !== "true")', () => {
      delete process.env.NEXT_PUBLIC_IS_E2E;
      clearWindowStores();

      jest.isolateModules(() => {
        require('@/lib/stores/friendStore');
        require('@/lib/stores/mapStore');
        require('@/lib/stores/syncStore');
        require('@/lib/stores/tripStore');
        require('@/lib/stores/uiStore');
        require('@/lib/stores/userStore');
        require('@/lib/stores/visitStore');
        require('@/lib/stores/wineryStore');
      });

      expect(window.useFriendStore).toBeUndefined();
      expect(window.useMapStore).toBeUndefined();
      expect(window.useSyncStore).toBeUndefined();
      expect(window.useTripStore).toBeUndefined();
      expect(window.useUIStore).toBeUndefined();
      expect(window.useUserStore).toBeUndefined();
      expect(window.useVisitStore).toBeUndefined();
      expect(window.useWineryStore).toBeUndefined();
      expect(window.useWineryDataStore).toBeUndefined();
      expect(window.idbKeyVal).toBeUndefined();
    });

    it('asserts stores ARE attached to window when explicitly enabled for E2E testing (NEXT_PUBLIC_IS_E2E === "true")', () => {
      process.env.NEXT_PUBLIC_IS_E2E = 'true';
      clearWindowStores();

      jest.isolateModules(() => {
        require('@/lib/stores/friendStore');
        require('@/lib/stores/mapStore');
        require('@/lib/stores/syncStore');
        require('@/lib/stores/tripStore');
        require('@/lib/stores/uiStore');
        require('@/lib/stores/userStore');
        require('@/lib/stores/visitStore');
        require('@/lib/stores/wineryStore');
      });

      expect(window.useFriendStore).toBeDefined();
      expect(window.useMapStore).toBeDefined();
      expect(window.useSyncStore).toBeDefined();
      expect(window.useTripStore).toBeDefined();
      expect(window.useUIStore).toBeDefined();
      expect(window.useUserStore).toBeDefined();
      expect(window.useVisitStore).toBeDefined();
      expect(window.useWineryStore).toBeDefined();
      expect(window.useWineryDataStore).toBeDefined();
    });
  });

  describe('Static Source Code Hygiene & Window Gating Verification', () => {
    const storeFiles = [
      'friendStore.ts',
      'mapStore.ts',
      'syncStore.ts',
      'tripStore.ts',
      'uiStore.ts',
      'userStore.ts',
      'visitStore.ts',
      'wineryStore.ts',
    ];

    it.each(storeFiles)(
      'asserts %s guards window attachment behind process.env.NEXT_PUBLIC_IS_E2E === "true"',
      (fileName) => {
        const filePath = path.join(process.cwd(), 'lib/stores', fileName);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Verify window store assignments exist but are strictly gated behind NEXT_PUBLIC_IS_E2E === 'true'
        const hasWindowAssignment = content.includes('(window as any).use') || content.includes('window.use');
        expect(hasWindowAssignment).toBe(true);

        // Assert that the window assignment is wrapped inside an E2E environment check
        expect(content).toMatch(/process\.env\.NEXT_PUBLIC_IS_E2E\s*===\s*['"]true['"]/);
      }
    );

    it('asserts uiStore.ts has zero cross-store window coupling ((window as any).useTripStore)', () => {
      const uiStorePath = path.join(process.cwd(), 'lib/stores/uiStore.ts');
      const content = fs.readFileSync(uiStorePath, 'utf-8');

      // Assert uiStore does not reach into tripStore via window
      const hasTripStoreWindowAccess =
        content.includes('(window as any).useTripStore') || content.includes('window.useTripStore');
      expect(hasTripStoreWindowAccess).toBe(false);
    });
  });
});
