/* eslint-disable react-hooks/rules-of-hooks */
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { Page, test as base } from '@playwright/test';
import { createMockWinery, createMockMapMarkerRpc, createMockVisitWithWinery } from '@/lib/test-utils/fixtures';
import mockPlacesSearch from './mocks/places-search.json';

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

    // Use consistent ID from mocks/places-search.json
    const mockWinery = createMockWinery({ id: 'ch-12345-mock-winery-1' as any });

    // 1. Inject robust Google Maps Mocks (New API + Geocoder)
    await this.page.addInitScript((mockPlaces) => {
      // Helper to satisfy useWineryFilter hook
      const mockBounds = { 
        contains: () => true,
        getCenter: () => ({ lat: () => 42.7, lng: () => -76.9 }),
        extend: () => {},
        getNorthEast: () => ({ lat: () => 43, lng: () => -76 }),
        getSouthWest: () => ({ lat: () => 42, lng: () => -77 })
      };

      // 1.1 Poll for Google Maps and apply overrides
      const interval = setInterval(() => {
        // @ts-ignore
        if (window.google && window.google.maps) {
          // @ts-ignore
          const maps = window.google.maps;

          // Mock LatLngBounds prototype to ensure contains() always returns true for mocks
          if (maps.LatLngBounds && !(maps.LatLngBounds as any)._isMocked) {
              maps.LatLngBounds.prototype.contains = () => true;
              (maps.LatLngBounds as any)._isMocked = true;
          }

          // Mock Geocoder
          if (maps.Geocoder && !(maps.Geocoder as any)._isMocked) {
              maps.Geocoder.prototype.geocode = (_req: any) => Promise.resolve({
                  results: [{
                      geometry: {
                          location: { lat: () => 42.7, lng: () => -76.9 },
                          viewport: mockBounds
                      }
                  }]
              }) as any;
              (maps.Geocoder as any)._isMocked = true;
          }

          // Mock New Places API (searchByText)
          if (maps.places && maps.places.Place && !(maps.places.Place as any)._isMocked) {
              maps.places.Place.searchByText = (req: any) => {
                  console.log('[E2E Mock] Intercepted searchByText', req.textQuery);
                  // Transform mock data to satisfy library expectation (lat/lng functions)
                  const places = mockPlaces.map(p => ({
                      ...p,
                      location: {
                          lat: () => p.location.latitude,
                          lng: () => p.location.longitude
                      },
                      fetchFields: () => Promise.resolve() // Mock fetchFields for lazy Detail calls
                  }));
                  return Promise.resolve({ places }) as any;
              };
              
              // Also mock the static constructor for lazy detail fetching if needed
              const originalPlace = maps.places.Place;
              (maps.places as any).Place = class extends originalPlace {
                  constructor(options: any) {
                      super(options);
                      // @ts-ignore
                      this.displayName = "Mock Winery One";
                      // @ts-ignore
                      this.formattedAddress = "123 Mockingbird Lane, Fakeville, FK 12345";
                      // @ts-ignore
                      this.location = { lat: () => 42.7, lng: () => -76.9 };
                  }
                  // @ts-ignore
                  fetchFields() { return Promise.resolve({ place: this }); }
              };
              
              (maps.places.Place as any)._isMocked = true;
          }

          // Inject bounds into store
          // @ts-ignore
          const store = window.useMapStore;
          if (store && store.setState) {
            store.setState({ bounds: mockBounds });
            const state = store.getState();
            if (state.map && !state.map._isPatched) {
                state.map.getBounds = () => mockBounds;
                state.map._isPatched = true;
                clearInterval(interval);
            }
          }
        }
      }, 100);
    }, mockPlacesSearch);

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

    // 2.1 Mock the Supabase RPC for wineries in bounds (used by executeSearch)
    await this.page.route(/\/rpc\/get_wineries_in_bounds/, (route) => {
      console.log('[E2E Mock] Intercepted get_wineries_in_bounds RPC');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
            createMockMapMarkerRpc({ google_place_id: 'ch-12345-mock-winery-1' as any }),
            createMockMapMarkerRpc({ id: 2 as any, google_place_id: 'ch-67890-mock-winery-2' as any, name: 'Vineyard of Illusion' })
        ]),
      });
    });

    // 2.2 Mock the Supabase REST endpoint for trips (Stateful)
    let mockTrips: any[] = [];
    const getTodayCA = () => new Date().toLocaleDateString('en-CA');

    await this.page.route(/\/rest\/v1\/trips/, (route) => {
      const method = route.request().method();
      const url = route.request().url();
      console.log(`[E2E Mock] Intercepted trips REST (${method}) ${url.slice(0, 50)}`);
      
      if (method === 'GET') {
        if (url.includes('trip_wineries')) {
            // Main list fetch
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockTrips),
                headers: { 'content-range': `0-${mockTrips.length - 1}/${mockTrips.length}` }
            });
        }
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockTrips),
        });
      }
      
      if (method === 'POST') {
          const body = JSON.parse(route.request().postData() || '{}');
          const newTrip = {
              id: Math.floor(Math.random() * 10000),
              name: body.name || 'New Trip',
              trip_date: body.trip_date || getTodayCA(),
              user_id: 'test-user-id',
              members: ['test-user-id'],
              trip_wineries: [{ count: 0 }],
              wineries: []
          };
          mockTrips.unshift(newTrip as any);
          return route.fulfill({
              status: 201,
              contentType: 'application/json',
              body: JSON.stringify(newTrip)
          });
      }

      if (method === 'PATCH') {
          const body = JSON.parse(route.request().postData() || '{}');
          const idMatch = url.match(/id=eq\.(\d+)/);
          const id = idMatch ? parseInt(idMatch[1], 10) : null;
          if (id !== null) {
              mockTrips = mockTrips.map(t => t.id === id ? { ...t, ...body } : t);
          }
          return route.fulfill({ status: 204 });
      }

      if (method === 'DELETE') {
          const idMatch = url.match(/id=eq\.(\d+)/);
          const id = idMatch ? parseInt(idMatch[1], 10) : null;
          if (id !== null) {
              mockTrips = mockTrips.filter(t => t.id !== id);
          }
          return route.fulfill({ status: 204 });
      }

      return route.continue();
    });

    // 2.3 Mock the upcoming trips RPC
    await this.page.route(/\/rpc\/get_upcoming_trips/, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTrips),
      });
    });

    // 2.4 Mock the trip details RPC
    await this.page.route(/\/rpc\/get_trip_details/, (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      const tripId = body.trip_id_param;
      const trip = mockTrips.find(t => t.id === tripId);
      
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(trip ? {
            ...trip,
            wineries: [],
            members: []
        } : null),
      });
    });

    // 2.4.1 Mock the delete trip RPC
    await this.page.route(/\/rpc\/delete_trip/, (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      const tripId = body.p_trip_id;
      console.log(`[E2E Mock] RPC delete trip ID: ${tripId}`);
      mockTrips = mockTrips.filter(t => t.id !== tripId);
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // 2.4.2 Mock the create trip with winery RPC
    await this.page.route(/\/rpc\/create_trip_with_winery/, (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      console.log(`[E2E Mock] RPC create_trip_with_winery: ${body.p_trip_name}`);
      const newTrip = {
          id: Math.floor(Math.random() * 10000),
          name: body.p_trip_name || 'New Trip',
          trip_date: body.p_trip_date || getTodayCA(),
          user_id: 'test-user-id',
          members: ['test-user-id'],
          trip_wineries: [{ count: 1 }],
          wineries: []
      };
      mockTrips.unshift(newTrip as any);
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ trip_id: newTrip.id }),
      });
    });

    // 2.4.3 Mock the add winery to trip RPC
    await this.page.route(/\/rpc\/add_winery_to_trip/, (route) => {
      console.log(`[E2E Mock] RPC add_winery_to_trip`);
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // 2.4.4 Mock the get trips for date RPC
    await this.page.route(/\/rpc\/get_trips_for_date/, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTrips),
      });
    });

    // 2.5 Mock the paginated wineries RPC (Browse List)
    await this.page.route(/\/rpc\/get_paginated_wineries/, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
            google_place_id: 'ch-12345-mock-winery-1',
            name: 'Mock Winery One',
            address: '123 Mockingbird Lane',
            latitude: 42.7,
            longitude: -76.9,
            google_rating: 4.5,
            is_favorite: false,
            on_wishlist: false,
            user_visited: false,
            visit_count: 0
        }]),
        headers: { 'x-total-count': '1' }
      });
    });

    // 3. Mock the Supabase RPC for map markers
    await this.page.route(/\/rpc\/get_map_markers/, (route) => {
      console.log('[E2E Mock] Intercepted get_map_markers RPC');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
            createMockMapMarkerRpc({ google_place_id: 'ch-12345-mock-winery-1' as any }),
            createMockMapMarkerRpc({ id: 2 as any, google_place_id: 'ch-67890-mock-winery-2' as any, name: 'Vineyard of Illusion' })
        ]),
      });
    });

    // 3.1 Intercept New Places API requests (Unified Handler)
    await this.page.route(/.*places\.googleapis\.com.*SearchText/, async (route) => {
      console.log('[E2E Mock] Intercepted Places API v1 SearchText via regex');
      const places = mockPlacesSearch.map(p => ({
        id: p.id,
        displayName: { text: p.displayName },
        formattedAddress: p.formattedAddress,
        location: {
          latitude: p.location.latitude,
          longitude: p.location.longitude
        },
        rating: p.rating
      }));
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ places }),
      });
    });

    // 4. Mock the Supabase RPC for visit history
    await this.page.route(/\/rpc\/get_paginated_visits_with_winery_and_friends/, (route) => {
      const mockVisit = createMockVisitWithWinery({ wineryId: 'ch-12345-mock-winery-1' as any });
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
      const mockVisit = createMockVisitWithWinery({ user_review: 'Updated review!', rating: 4, wineryId: 'ch-12345-mock-winery-1' as any });
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

    // 9. Block costly Google Data APIs LAST (specific mocks added earlier will take precedence)
    await this.page.route(/(google|googleapis|places)/, async (route) => {
      const url = route.request().url();
      const type = route.request().resourceType();

      // Allow essential scripts and fonts
      if (type === 'script' || type === 'font' || type === 'stylesheet' || url.includes('js?key=')) {
        return route.continue();
      }

      // Mock map tiles with a tiny transparent PNG
      if (url.includes('vt?') || url.includes('kh?')) {
          return route.fulfill({
              contentType: 'image/png',
              body: Buffer.from('iVBORw0KGgoAAAANghjYAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
          });
      }

      // Default: Abort costly data requests
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
  mockMaps: [async ({ page }, use) => {
    const manager = new MockMapsManager(page);
    await manager.initDefaultMocks();
    await use(manager);
  }, { auto: true }],

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
