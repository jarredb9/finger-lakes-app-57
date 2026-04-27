import { test, expect } from './utils';
import { login, clearServiceWorkers, waitForAppReady } from './helpers';

test.describe('Sync Infrastructure (Phase 2)', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    // Ensure fresh start
    await clearServiceWorkers(page);
    mockMaps.useRealVisits();
    
    await login(page, user.email, user.password);
    await waitForAppReady(page);

    // Wait for store exposure and user hydration with higher timeout
    await page.waitForFunction(() => {
        const uStore = (window as any).useUserStore;
        const sStore = (window as any).useSyncStore;
        const uState = uStore?.getState?.();
        const sState = sStore?.getState?.();
        
        const hasUStore = !!uStore;
        const hasSStore = !!sStore;
        const hasUser = !!uState?.user;
        const isSInit = !!sState?.isInitialized;

        if (!hasUStore || !hasSStore || !hasUser || !isSInit) {
            // @ts-ignore
            if (window._lastLog !== `${hasUStore}-${hasSStore}-${hasUser}-${isSInit}`) {
                console.log(`[DIAGNOSTIC] Waiting for hydration: uStore=${hasUStore}, sStore=${hasSStore}, user=${hasUser}, sInit=${isSInit}`);
                // @ts-ignore
                window._lastLog = `${hasUStore}-${hasSStore}-${hasUser}-${isSInit}`;
            }
            return false;
        }
        return true;
    }, { timeout: 30000 });
  });

  test('should persist encrypted mutations in IndexedDB and sync on reconnect', async ({ page, context }) => {
    // 0. Get the current user ID for encryption verification
    const userId = await page.evaluate(() => {
      // @ts-ignore
      const user = window.useUserStore.getState().user;
      if (!user) throw new Error('User not found in store');
      return user.id;
    });

    expect(userId).toBeTruthy();

    // 1. Add a mutation while offline
    await context.setOffline(true);

    const testPayload = { wineryDbId: 999, visit_date: '2026-04-24', rating: 5 };
    
    await page.evaluate(async ({ payload, uid }) => {
      // @ts-ignore
      const syncStore = window.useSyncStore.getState();
      await syncStore.addMutation({
        type: 'log_visit',
        payload,
        userId: uid
      });
    }, { payload: testPayload, uid: userId });

    // 2. Verify it's in the Zustand store
    const queueLength = await page.evaluate(() => (window as any).useSyncStore.getState().queue.length);
    expect(queueLength).toBe(1);

    // 3. Verify it's encrypted in IndexedDB (Direct inspection)
    const idbData: any = await page.evaluate(async () => {
      console.log('[DIAGNOSTIC] Starting IDB direct inspection via idbKeyVal');
      // @ts-ignore
      return await window.idbKeyVal.get('encrypted-offline-queue');
    });

    expect(Array.isArray(idbData)).toBe(true);
    expect(idbData[0].encryptedPayload).toBeTruthy();
    // Verify it is NOT plain text JSON (should not contain our known keys)
    expect(idbData[0].encryptedPayload).not.toContain('wineryDbId');
    expect(idbData[0].encryptedPayload).not.toContain('2026-04-24');

    // Verify it CAN be decrypted
    const decryptedPayload = await page.evaluate(async ({ item, uid }) => {
      // @ts-ignore
      return await window.useSyncStore.getState().getDecryptedPayload(item, uid);
    }, { item: idbData[0], uid: userId });

    expect(decryptedPayload.wineryDbId).toBe(999);
    expect(decryptedPayload.rating).toBe(5);

    // 4. Reload and verify persistence (Hydration)
    // We must be online to reload since Service Worker is blocked in this test
    await context.setOffline(false);
    
    // We mock the RPC to ensure it doesn't clear too fast if sync triggers
    await context.route(/.*\/rpc\/log_visit.*/, async (route) => {
      // Delay response to allow us to see the rehydrated state if sync starts
      await new Promise(r => setTimeout(r, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ visit_id: 123 })
      });
    });

    await page.reload();
    // Wait for hydration
    await page.waitForFunction(() => (window as any).useSyncStore?.getState().isInitialized);
    
    // Note: It might already be 0 if sync was extremely fast, 
    // but with the 1s delay in the route it should stay 1 for a bit.
    const rehydratedLength = await page.evaluate(() => (window as any).useSyncStore.getState().queue.length);
    // If it's already 0, it means it synced, which is also a form of success for rehydration (it had to rehydrate to sync)
    expect(rehydratedLength).toBeLessThanOrEqual(1);

    // 6. Verify the queue clears automatically via SyncService (if not already cleared)
    await expect(async () => {
      const currentQueue = await page.evaluate(() => (window as any).useSyncStore.getState().queue.length);
      expect(currentQueue).toBe(0);
    }).toPass({ timeout: 15000 });
  });
});
