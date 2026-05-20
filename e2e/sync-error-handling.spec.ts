import { test, expect } from './utils';
import { login, clearServiceWorkers, waitForAppReady } from './helpers';

test.describe('Sync Error Handling (Non-Blocking Loop)', () => {
  test('should continue syncing when one item fails and mark failing item as error', async ({ page, context, mockMaps, user }) => {
    // 1. Explicit Cleanup and Setup
    await clearServiceWorkers(page);
    mockMaps.useRealVisits();
    
    await login(page, user.email, user.password);
    await waitForAppReady(page);

    // Wait for store exposure and user hydration
    await page.waitForFunction(() => {
        const uStore = (window as any).useUserStore;
        const sStore = (window as any).useSyncStore;
        const uState = uStore?.getState?.();
        const sState = sStore?.getState?.();
        
        return !!uStore && !!sStore && !!uState?.user && !!sState?.isInitialized;
    }, { timeout: 30000 });

    const userId = await page.evaluate(() => (window as any).useUserStore.getState().user.id);

    // 2. Add two mutations while offline
    await context.setOffline(true);

    const payload1 = { wineryDbId: 101, visit_date: '2026-04-24', rating: 1 };
    const payload2 = { wineryDbId: 102, visit_date: '2026-04-24', rating: 5 };
    
    await page.evaluate(async ({ p1, p2, uid }) => {
      // @ts-ignore
      const syncStore = window.useSyncStore.getState();
      await syncStore.addMutation({ type: 'log_visit', payload: p1, userId: uid });
      await syncStore.addMutation({ type: 'log_visit', payload: p2, userId: uid });
    }, { p1: payload1, p2: payload2, uid: userId });

    const initialQueue = await page.evaluate(() => (window as any).useSyncStore.getState().queue);
    expect(initialQueue.length).toBe(2);
    expect(initialQueue[0].status).toBe('pending');
    expect(initialQueue[1].status).toBe('pending');

    // 3. Mock network: First fails, Second succeeds
    // Define routes BEFORE setting offline(false) to catch early sync attempts
    let callCount = 0;
    await context.route(/.*\/rpc\/log_visit.*/, async (route) => {
      callCount++;
      const postData = route.request().postDataJSON();
      console.log(`[DIAGNOSTIC] Intercepted log_visit RPC. Rating: ${postData?.p_visit_data?.rating}, Count: ${callCount}`);
      
      // Use the rating to distinguish
      if (postData?.p_visit_data?.rating === 1) {
        console.log('[DIAGNOSTIC] Fulfilling with 500 Error');
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Database error' })
        });
      } else {
        console.log('[DIAGNOSTIC] Fulfilling with 200 Success');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ visit_id: 123 })
        });
      }
    });

    console.log('[DIAGNOSTIC] Setting network ONLINE');
    await context.setOffline(false);
    
    // Wait for auth to stabilize to prevent middleware redirects
    console.log('[DIAGNOSTIC] Waiting for auth stability...');
    await page.waitForResponse(resp => resp.url().includes('/auth/v1/user'), { timeout: 10000 }).catch(() => null);
    await page.waitForTimeout(1000);

    // 4. Wait for Sync to complete
    console.log('[DIAGNOSTIC] Starting sync check loop...');
    await expect(async () => {
      const state = await page.evaluate(() => {
          const sStore = (window as any).useSyncStore;
          if (!sStore) return null;
          const sState = sStore.getState();
          return {
            isSyncing: (window as any).SyncService.isSyncing,
            queue: sState.queue,
            isInitialized: sState.isInitialized
          };
      });
      
      if (!state || !state.isInitialized) {
          throw new Error('SyncStore not initialized or not exposed');
      }

      const { isSyncing, queue } = state;
      console.log(`[DIAGNOSTIC] Sync State - isSyncing: ${isSyncing}, Queue Length: ${queue.length}`);
      
      // We expect one item to be synced (removed) and one to be marked as error
      if (!isSyncing && queue.length === 1 && queue[0].status === 'error') {
        return true;
      }
      
      // If not syncing and still have 2 items, try to trigger it manually once if it's not already running
      if (!isSyncing && queue.length === 2) {
          console.log('[DIAGNOSTIC] Manual sync trigger fallback');
          await page.evaluate(() => (window as any).SyncService.sync()).catch(() => {});
      }
      
      throw new Error(`Sync not complete. Queue: ${JSON.stringify(queue.map((i: any) => ({id: i.id, status: i.status})))}`);
    }).toPass({ timeout: 20000, intervals: [2000] });

    // 5. Verify final state before reload
    const finalQueueState = await page.evaluate(() => (window as any).useSyncStore.getState().queue);
    expect(finalQueueState.length).toBe(1);
    expect(finalQueueState[0].status).toBe('error');

    // 6. Wait for IDB persistence to settle
    await page.waitForTimeout(1000);

    // 7. Reload and verify persistence
    await page.reload();
    await page.waitForFunction(() => (window as any).useSyncStore?.getState().isInitialized);

    const rehydratedQueue = await page.evaluate(() => (window as any).useSyncStore.getState().queue);
    expect(rehydratedQueue.length).toBe(1);
    expect(rehydratedQueue[0].status).toBe('error');
    
    // 8. Ensure SyncService skips the error item on subsequent sync
    await context.unroute(/.*\/rpc\/log_visit.*/);
    let retryCallCount = 0;
    await context.route(/.*\/rpc\/log_visit.*/, async (route) => {
      retryCallCount++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ visit_id: 456 })
      });
    });

    await page.evaluate(async () => {
      // @ts-ignore
      await window.SyncService.sync();
    });

    // Wait a bit to ensure it doesn't sync
    await new Promise(r => setTimeout(r, 2000));
    
    const queueAfterRetry = await page.evaluate(() => (window as any).useSyncStore.getState().queue);
    expect(queueAfterRetry.length).toBe(1);
    expect(queueAfterRetry[0].status).toBe('error');
    expect(retryCallCount).toBe(0);
  });
});
