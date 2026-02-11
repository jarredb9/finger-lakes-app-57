/* eslint-disable react-hooks/rules-of-hooks */
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { Page, test as base } from '@playwright/test';
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
 * Manager class for handling API mocks in E2E tests.
 */
export class MockMapsManager {
  constructor(private page: Page) {}

  /**
   * Initializes default mocks for Google Maps and Supabase RPCs.
   * This is called automatically by the mockMaps fixture.
   */
  async initDefaultMocks() {
    if (process.env.E2E_REAL_DATA === 'true') return;

    const mockWinery = createMockWinery();

    // 1. Inject a mock bounds object into the store to satisfy the useWineryFilter hook
    await this.page.addInitScript(() => {
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
          store.setState({ bounds: mockBounds });
          const state = store.getState();
          if (state.map && !state.map._isPatched) {
              state.map.getBounds = () => mockBounds;
              state.map._isPatched = true;
              clearInterval(interval);
          }
        }
      }, 100);
    });

    // 2. Mock the Supabase Edge Function for winery details
    await this.page.route(/\/functions\/v1\/get-winery-details/, (route) => {
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

    // 3. Mock the Supabase RPC for map markers
    await this.page.route(/\/rpc\/get_map_markers/, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
            createMockMapMarkerRpc(),
            createMockMapMarkerRpc({ id: 2 as any, google_place_id: 'ch-mock-winery-2' as any, name: 'Vineyard of Illusion' })
        ]),
      });
    });

    // 4. Mock the Supabase RPC for visit history
    await this.page.route(/\/rpc\/get_paginated_visits_with_winery_and_friends/, (route) => {
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

    // 5. Mock log_visit RPC
    await this.page.route(/\/rpc\/log_visit/, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ visit_id: 'mock-visit-new' }),
      });
    });

    // 6. Mock Visit Mutation RPCs
    await this.page.route(/\/rpc\/update_visit/, (route) => {
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

    await this.page.route(/\/rpc\/delete_visit/, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // 7. Mock List Toggles
    await this.page.route(/\/rpc\/toggle_wishlist/, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(true),
      });
    });

    await this.page.route(/\/rpc\/toggle_favorite/, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(true),
      });
    });

    // 8. Mock delete visit (Supabase REST)
    await this.page.route(/\/rest\/v1\/visits\?/, (route) => {
      if (route.request().method() === 'DELETE') {
          route.fulfill({ status: 204 });
      } else {
          route.continue();
      }
    });

    // 9. Block costly Google Data APIs
    await this.page.route(/(google|googleapis|places)/, async (route) => {
      const url = route.request().url();
      const type = route.request().resourceType();

      if (type === 'script' || type === 'font' || type === 'stylesheet' || url.includes('js?key=')) {
        return route.continue();
      }

      if (url.includes('vt?') || url.includes('kh?')) {
          return route.fulfill({
              contentType: 'image/png',
              body: Buffer.from('iVBORw0KGgoAAAANghjYAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
          });
      }

      return route.abort('failed');
    });
  }

  /**
   * Bypasses mocks for visit-related RPCs, allowing them to hit the real database.
   */
  async useRealVisits() {
    await this.page.unroute(/\/rpc\/log_visit/);
    await this.page.unroute(/\/rpc\/update_visit/);
    await this.page.unroute(/\/rpc\/delete_visit/);
    await this.page.unroute(/\/rpc\/get_paginated_visits_with_winery_and_friends/);
  }

  /**
   * Bypasses mocks for social-related RPCs.
   */
  async useRealSocial() {
    await this.page.unroute(/\/rpc\/get_friends_and_requests/);
    await this.page.unroute(/\/rpc\/send_friend_request/);
    await this.page.unroute(/\/rpc\/respond_to_friend_request/);
    await this.page.unroute(/\/rpc\/get_friend_activity_feed/);
  }

  /**
   * Simulates a failure when loading map markers.
   */
  async failMarkers() {
    await this.page.route(/\/rpc\/get_map_markers/, (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Internal Server Error' }),
      });
    });
  }

  /**
   * Simulates a failure when loading trips.
   */
  async failTrips() {
    await this.page.route(/\/rest\/v1\/trips/, (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Database Connection Failed' }),
      });
    });
  }

  /**
   * Simulates a failure when logging in.
   */
  async failLogin() {
    await this.page.route('**/auth/v1/token**', (route) => {
      route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
      });
    });
  }
}

/**
 * Extended Playwright test object with custom fixtures.
 */
export const test = base.extend<{
  mockMaps: MockMapsManager;
  user: TestUser;
}>({
  mockMaps: async ({ page }, use) => {
    const manager = new MockMapsManager(page);
    await manager.initDefaultMocks();
    await use(manager);
  },

  user: async ({}, use) => {
    const email = `test-${uuidv4()}@example.com`;
    const password = `pass-${uuidv4()}`;
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
    
    if (error || !data.user) throw new Error(`Failed to create test user: ${error?.message}`);
    
    const testUser = { id: data.user.id, email, password };
    
    await use(testUser);

    // Cleanup Storage (visit-photos)
    try {
      const { data: files } = await supabase.storage.from('visit-photos').list(`${testUser.id}`, {
         limit: 100,
         offset: 0,
         sortBy: { column: 'name', order: 'asc' },
      });

      if (files && files.length > 0) {
          const folderPaths = files.map(f => `${testUser.id}/${f.name}`);
          for (const folder of folderPaths) {
              const { data: subFiles } = await supabase.storage.from('visit-photos').list(folder.replace(`${testUser.id}/`, ''), { search: '' });
              if (subFiles && subFiles.length > 0) {
                  const pathsToDelete = subFiles.map(sf => `${folder}/${sf.name}`);
                  await supabase.storage.from('visit-photos').remove(pathsToDelete);
              }
          }
      }
    } catch (err) {
        console.warn(`[Test Cleanup] Failed to clean storage for user ${testUser.id}:`, err);
    }

    await supabase.auth.admin.deleteUser(testUser.id);
  }
});

export { expect } from '@playwright/test';

/**
 * Legacy support for mockGoogleMapsApi.
 * @deprecated Use the mockMaps fixture instead.
 */
export async function mockGoogleMapsApi(page: Page) {
  const manager = new MockMapsManager(page);
  await manager.initDefaultMocks();
}

/**
 * Legacy support for createTestUser.
 * @deprecated Use the user fixture instead.
 */
export async function createTestUser(): Promise<TestUser> {
  const email = `test-${uuidv4()}@example.com`;
  const password = `pass-${uuidv4()}`;
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`Failed: ${error?.message}`);
  return { id: data.user.id, email, password };
}

/**
 * Legacy support for deleteTestUser.
 * @deprecated The user fixture handles cleanup automatically.
 */
export async function deleteTestUser(userId: string): Promise<void> {
  try {
    const { data: files } = await supabase.storage.from('visit-photos').list(`${userId}`, {
       limit: 100,
       offset: 0,
       sortBy: { column: 'name', order: 'asc' },
    });

    if (files && files.length > 0) {
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

  await supabase.auth.admin.deleteUser(userId);
}
