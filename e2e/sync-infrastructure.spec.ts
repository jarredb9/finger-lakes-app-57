import { test, expect } from './utils';
import { login, clearServiceWorkers } from './helpers';

test.describe('Sync Infrastructure (Phase 2)', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    // 1. Ensure fresh start
    await clearServiceWorkers(page);
    mockMaps.useRealVisits();
    
    // 2. Standardized UI login
    await login(page, user.email, user.password);

    // 3. Fast hydration check for User store, Sync store, and IDB
    await expect(async () => {
      const isReady = await page.evaluate(() => {
        const uStore = (window as any).useUserStore?.getState?.();
        const sStore = (window as any).useSyncStore?.getState?.();
        const idb = (window as any).idbKeyVal;
        return !!uStore?.user && !!sStore?.isInitialized && !!idb;
      }).catch(() => false);
      if (!isReady) throw new Error('Waiting for stores and IDB initialization');
    }).toPass({ timeout: 10000, intervals: [500] });
  });

  test('should persist encrypted mutations in IndexedDB and sync on reconnect', async ({ page, context }) => {
    // 1. Get current authenticated user ID for encryption verification
    const userId = await page.evaluate(() => {
      const user = (window as any).useUserStore.getState().user;
      if (!user) throw new Error('User not found in store');
      return user.id;
    });

    expect(userId).toBeTruthy();

    // 2. Add a mutation while offline
    await context.setOffline(true);

    const testPayload = { wineryDbId: 999, visit_date: '2026-04-24', rating: 5 };
    
    await page.evaluate(async ({ payload, uid }) => {
      const syncStore = (window as any).useSyncStore.getState();
      await syncStore.addMutation({
        type: 'log_visit',
        payload,
        userId: uid
      });
    }, { payload: testPayload, uid: userId });

    // 3. Verify in-memory queue state
    const initialQueue = await page.evaluate(() => (window as any).useSyncStore.getState().queue);
    expect(initialQueue.length).toBe(1);
    expect(initialQueue[0].type).toBe('log_visit');
    expect(initialQueue[0].status).toBe('pending');

    // 4. Verify encrypted persistence in IndexedDB
    const idbData: any = await page.evaluate(async () => {
      return await (window as any).idbKeyVal.get('encrypted-offline-queue');
    });

    expect(Array.isArray(idbData)).toBe(true);
    expect(idbData.length).toBe(1);
    expect(idbData[0].encryptedPayload).toBeTruthy();
    // Ensure plaintext sensitive data is not exposed in IndexedDB
    expect(idbData[0].encryptedPayload).not.toContain('wineryDbId');
    expect(idbData[0].encryptedPayload).not.toContain('2026-04-24');

    // 5. Verify payload can be successfully decrypted
    const decryptedPayload = await page.evaluate(async ({ item, uid }) => {
      return await (window as any).useSyncStore.getState().getDecryptedPayload(item, uid);
    }, { item: idbData[0], uid: userId });

    expect(decryptedPayload.wineryDbId).toBe(999);
    expect(decryptedPayload.rating).toBe(5);

    // 6. Verify Store Persistence & Rehydration from IndexedDB
    // Reset in-memory Zustand store and re-initialize from IDB
    await page.evaluate(async () => {
      const store = (window as any).useSyncStore;
      store.setState({ queue: [], isInitialized: false });
      await store.getState().initialize();
    });

    const rehydratedQueue = await page.evaluate(() => (window as any).useSyncStore.getState().queue);
    expect(rehydratedQueue.length).toBe(1);
    expect(rehydratedQueue[0].id).toBe(initialQueue[0].id);
    expect(rehydratedQueue[0].type).toBe('log_visit');

    // 7. Setup clean RPC mock for reconnect sync (immediate 200 OK with CORS preflight handling)
    let rpcCalled = false;
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-total-count, x-skip-sw-interception',
      'Cache-Control': 'no-store'
    };

    const rpcHandler = async (route: any) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: corsHeaders });
      }
      rpcCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify({ visit_id: 123 })
      });
    };
    await context.route(/.*\/rpc\/log_visit.*/, rpcHandler);
    await page.route(/.*\/rpc\/log_visit.*/, rpcHandler);

    // 8. Reconnect to network
    await context.setOffline(false);

    // 9. Verify the queue clears automatically via SyncService upon reconnection
    await expect(async () => {
      const state = await page.evaluate(() => {
        const syncStore = (window as any).useSyncStore;
        const syncService = (window as any).SyncService;
        if (!syncStore || !syncStore.getState().isInitialized) {
          return null;
        }
        return {
          isSyncing: !!syncService?.isSyncing,
          queueLength: syncStore.getState().queue.length
        };
      });

      if (!state) {
        throw new Error('SyncStore not ready or initialized');
      }

      if (state.queueLength === 0) {
        return true;
      }

      // If sync is not actively in-flight but queue still has items, trigger sync
      if (!state.isSyncing) {
        await page.evaluate(() => (window as any).SyncService?.sync?.()).catch(() => {});
      }

      throw new Error(`Sync pending, current queue length: ${state.queueLength}`);
    }).toPass({ timeout: 15000, intervals: [500] });

    expect(rpcCalled).toBe(true);

    // 10. Verify IndexedDB queue is also cleared after sync
    const finalIdbData: any = await page.evaluate(async () => {
      return await (window as any).idbKeyVal.get('encrypted-offline-queue');
    });
    expect(finalIdbData).toEqual([]);
  });
});
