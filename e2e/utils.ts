import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { Page } from '@playwright/test';
import { createMockWinery, createMockMapMarkerRpc, createMockVisitWithWinery } from '@/lib/test-utils/fixtures';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for test utils');
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

export interface TestUser {
  id: string;
  email: string;
  password:string;
}

/**
 * MOCKS & BLOCKS the Google Maps API for E2E tests.
 */
export async function mockGoogleMapsApi(page: Page) {
  if (process.env.E2E_REAL_DATA === 'true') return;

  const mockWinery = createMockWinery();

  // 1. Inject a mock bounds object into the store to satisfy the useWineryFilter hook
  // This bypasses the need for real map tiles/initialization.
  await page.addInitScript(() => {
    const mockBounds = { 
      contains: () => true,
      getCenter: () => ({ lat: () => 42.7, lng: () => -76.9 }),
      extend: () => {},
      getNorthEast: () => ({ lat: () => 43, lng: () => -76 }),
      getSouthWest: () => ({ lat: () => 42, lng: () => -77 })
    };

    const interval = setInterval(() => {
      const store = (window as any).useMapStore;
      if (store && store.setState) {
        // 1. Inject bounds directly
        store.setState({ bounds: mockBounds });

        // 2. Patch the map instance if it exists to prevent overwriting
        const state = store.getState();
        if (state.map && !state.map._isPatched) {
            console.log('[E2E Mock] Patching map.getBounds');
            state.map.getBounds = () => mockBounds;
            state.map._isPatched = true;
            clearInterval(interval);
        }
      }
    }, 100);
  });

  // 2. Mock the Supabase Edge Function for winery details
  await page.route(/\/functions\/v1\/get-winery-details/, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        google_place_id: mockWinery.id,
        name: mockWinery.name,
        address: mockWinery.address,
        latitude: mockWinery.lat,
        longitude: mockWinery.lng,
        google_rating: mockWinery.rating,
        opening_hours: { weekday_text: ["Monday: 10:00 AM – 5:00 PM"] },
        reviews: [],
      }),
    });
  });

  // 2. Mock the Supabase RPC for map markers
  await page.route(/\/rpc\/get_map_markers/, (route) => {
    console.log('[E2E Mock] Intercepted get_map_markers RPC');
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
          createMockMapMarkerRpc(),
          createMockMapMarkerRpc({ id: 2 as any, google_place_id: 'ch-mock-winery-2' as any, name: 'Vineyard of Illusion' })
      ]),
    });
  });

  // 2.5 Mock the Supabase RPC for visit history
  await page.route(/\/rpc\/get_paginated_visits_with_winery_and_friends/, (route) => {
    console.log('[E2E Mock] Intercepted get_paginated_visits RPC');
    const mockVisit = createMockVisitWithWinery();
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        visit_id: mockVisit.id,
        user_id: mockVisit.user_id,
        visit_date: mockVisit.visit_date,
        user_review: mockVisit.user_review,
        rating: mockVisit.rating,
        photos: mockVisit.photos,
        winery_id: mockVisit.winery_id,
        winery_name: mockVisit.wineryName,
        google_place_id: mockVisit.wineryId,
        winery_address: mockVisit.wineries.address,
        friend_visits: []
      }]),
    });
  });

  // 2.6 Mock log_visit RPC
  await page.route(/\/rpc\/log_visit/, (route) => {
    console.log('[E2E Mock] Intercepted log_visit RPC');
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ visit_id: 'mock-visit-new' }),
    });
  });

  // 2.6.6 Mock Visit Mutation RPCs
  await page.route(/\/rpc\/update_visit/, (route) => {
    console.log('[E2E Mock] Intercepted update_visit RPC');
    const mockVisit = createMockVisitWithWinery({ user_review: 'Updated review!', rating: 4 });
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: mockVisit.id,
        visit_date: mockVisit.visit_date,
        user_review: mockVisit.user_review,
        rating: mockVisit.rating,
        photos: mockVisit.photos,
        winery_id: mockVisit.winery_id,
        winery_name: mockVisit.wineryName,
        winery_address: mockVisit.wineries.address,
        google_place_id: mockVisit.wineryId
      }),
    });
  });

  await page.route(/\/rpc\/delete_visit/, (route) => {
    console.log('[E2E Mock] Intercepted delete_visit RPC');
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  // 2.6.7 Mock List Toggles
  await page.route(/\/rpc\/toggle_wishlist/, (route) => {
    console.log('[E2E Mock] Intercepted toggle_wishlist RPC');
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(true),
    });
  });

  await page.route(/\/rpc\/toggle_favorite/, (route) => {
    console.log('[E2E Mock] Intercepted toggle_favorite RPC');
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(true),
    });
  });

  // 2.7 Mock delete visit (Supabase REST - Legacy/Compatibility)
  await page.route(/\/rest\/v1\/visits\?/, (route) => {
    if (route.request().method() === 'DELETE') {
        console.log('[E2E Mock] Intercepted Supabase DELETE Visit');
        route.fulfill({
            status: 204, 
        });
    } else {
        route.continue();
    }
  });

  // 3. Block costly Google Data APIs
  await page.route(/(google|googleapis|places)/, async (route) => {
    const url = route.request().url();
    const type = route.request().resourceType();

    // ALLOW: Library scripts and fonts (Free)
    if (type === 'script' || type === 'font' || type === 'stylesheet' || url.includes('js?key=')) {
      return route.continue();
    }

    // GHOST TILES: Fulfill tile requests with a transparent PNG to keep the Map SDK happy
    // but avoid $ spending and visual flakiness.
    if (url.includes('vt?') || url.includes('kh?')) {
        return route.fulfill({
            contentType: 'image/png',
            body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
        });
    }

    // BLOCK everything else (Search, Telemetry)
    return route.abort('failed');
  });
}

export async function createTestUser(): Promise<TestUser> {
  const email = `test-${uuidv4()}@example.com`;
  const password = `pass-${uuidv4()}`;
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`Failed: ${error?.message}`);
  return { id: data.user.id, email, password };
}

export async function deleteTestUser(userId: string): Promise<void> {
  // 1. Cleanup Storage (visit-photos)
  try {
    const { data: files } = await supabase.storage.from('visit-photos').list(`${userId}`, {
       limit: 100,
       offset: 0,
       sortBy: { column: 'name', order: 'asc' },
    });

    if (files && files.length > 0) {
        // We need to recursively find files because .list() is shallow? 
        // Actually, for this app structure, files are in userId/visitId/filename or userId/uuid/filename.
        // Listing the root userId folder returns the subfolders (visitIds).
        // We need to delete everything under userId.
        
        // Strategy: Use a recursive deletion or just empty known paths.
        // Since Supabase Storage doesn't support recursive delete of a folder easily via SDK without listing,
        // and we might have nested folders.
        
        // Simplified approach for standard test artifacts:
        // The artifacts are usually explicitly deep.
        // Let's try to just delete the user and rely on a periodic cleanup script if we can't easily recurse here without bloat.
        
        // BETTER APPROACH for E2E speed: 
        // Just empty the bucket for this user prefix if possible.
        // Unfortuantely Supabase SDK .remove() expects full paths to files, not folders.
        
        // Let's list the top level folders (visit IDs)
        const folderPaths = files.map(f => `${userId}/${f.name}`);
        
        for (const folder of folderPaths) {
            const { data: subFiles } = await supabase.storage.from('visit-photos').list(folder.replace(`${userId}/`, ''), { search: '' });
            if (subFiles && subFiles.length > 0) {
                const pathsToDelete = subFiles.map(sf => `${folder}/${sf.name}`);
                await supabase.storage.from('visit-photos').remove(pathsToDelete);
            }
        }
    }
  } catch (err) {
      console.warn(`[Test Cleanup] Failed to clean storage for user ${userId}:`, err);
  }

  // 2. Delete User (Cascades to DB rows)
  await supabase.auth.admin.deleteUser(userId);
}