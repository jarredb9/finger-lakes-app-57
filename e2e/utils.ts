/* eslint-disable react-hooks/rules-of-hooks */
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { Page, test as base } from '@playwright/test';
import { createMockWinery, createMockMapMarkerRpc, createMockVisitWithWinery, createMockTrip } from '@/lib/test-utils/fixtures';
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
  private allowServiceWorker = false;

  constructor(private page: Page) {}

  /**
   * Enable service worker for high-fidelity PWA testing.
   */
  enableServiceWorker() {
    this.allowServiceWorker = true;
  }

  /**
   * Initializes default mocks for Google Maps and Supabase RPCs.
   * This is called automatically by the mockMaps fixture.
   */
  async initDefaultMocks() {
    if (process.env.E2E_REAL_DATA === 'true') return;

    // Use context-level routing to ensure Service Worker requests are intercepted
    const context = this.page.context();
    const mockWinery = createMockWinery({ id: 'ch-12345-mock-winery-1' as any });
    const todayCA = new Date().toLocaleDateString('en-CA');

    const commonHeaders = { 
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    };

    // 0. Conditionally Block Service Worker Registration
    if (!this.allowServiceWorker) {
        await context.route('**/sw.js', route => route.abort());
        await this.page.addInitScript(() => {
            // Redefine register to be a no-op
            if (navigator.serviceWorker) {
                (navigator.serviceWorker as any).register = () => Promise.resolve({
                    unregister: () => Promise.resolve(true),
                    addEventListener: () => {},
                    removeEventListener: () => {},
                    dispatchEvent: () => false,
                });
            }
        });
    }

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
      const applyMocks = () => {
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
              maps.places.Place.searchByText = () => {
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
                (window as any)._mapsMocked = true;
                return true;
            }
          }
        }
        return false;
      };

      if (!applyMocks()) {
          const interval = setInterval(() => {
            if (applyMocks()) clearInterval(interval);
          }, 100);
      }
    }, mockPlacesSearch);

    // 1.2 Mock Social RPCs
    await this.mockSocial();

    // 2. Mock the Supabase Edge Function for winery details
    await context.route(/\/functions\/v1\/get-winery-details/, (route) => {
      console.log('Mocked get-winery-details');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
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
    await context.route(/\/rpc\/get_wineries_in_bounds/, (route) => {
      console.log('Mocked get_wineries_in_bounds');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify([
            createMockMapMarkerRpc({ google_place_id: 'ch-12345-mock-winery-1' as any }),
            createMockMapMarkerRpc({ id: 2 as any, google_place_id: 'ch-67890-mock-winery-2' as any, name: 'Vineyard of Illusion' })
        ]),
      });
    });

    // 2.2 Mock the Supabase REST endpoint for trips (Stateful)
    let mockTrips: any[] = [];

    await context.route(/\/rest\/v1\/trips/, (route) => {
      console.log('Mocked /rest/v1/trips');
      const method = route.request().method();
      const url = route.request().url();
      
      if (method === 'GET') {
        const count = mockTrips.length;
        if (url.includes('trip_wineries')) {
            // Main list fetch
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockTrips),
                headers: { ...commonHeaders, 'content-range': count > 0 ? `0-${count - 1}/${count}` : '*/0' }
            });
        }
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockTrips),
            headers: commonHeaders
        });
      }
      
      if (method === 'POST') {
          const body = JSON.parse(route.request().postData() || '{}');
          const newTrip = createMockTrip({
              id: Math.floor(Math.random() * 10000),
              name: body.name || 'New Trip',
              trip_date: body.trip_date || todayCA,
              user_id: 'test-user-id',
              members: ['test-user-id'],
          });
          // Add extra fields needed for UI
          (newTrip as any).trip_wineries = [{ count: 0 }];
          mockTrips.unshift(newTrip);
          return route.fulfill({
              status: 201,
              contentType: 'application/json',
              body: JSON.stringify(newTrip),
              headers: commonHeaders
          });
      }

      if (method === 'PATCH') {
          const body = JSON.parse(route.request().postData() || '{}');
          const idMatch = url.match(/id=eq\.(\d+)/);
          const id = idMatch ? parseInt(idMatch[1], 10) : null;
          if (id !== null) {
              mockTrips = mockTrips.map(t => t.id === id ? { ...t, ...body } : t);
          }
          return route.fulfill({ status: 204, headers: commonHeaders });
      }

      if (method === 'DELETE') {
          const idMatch = url.match(/id=eq\.(\d+)/);
          const id = idMatch ? parseInt(idMatch[1], 10) : null;
          if (id !== null) {
              mockTrips = mockTrips.filter(t => t.id !== id);
          }
          return route.fulfill({ status: 204, headers: commonHeaders });
      }

      return route.continue();
    });

    // 2.3 Mock the upcoming trips RPC
    await context.route(/\/rpc\/get_upcoming_trips/, (route) => {
      console.log('Mocked get_upcoming_trips');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTrips),
        headers: commonHeaders
      });
    });

    // 2.4 Mock the trip details RPC
    await context.route(/\/rpc\/get_trip_details/, (route) => {
      console.log('Mocked get_trip_details');
      const body = JSON.parse(route.request().postData() || '{}');
      const tripId = body.trip_id_param;
      const trip = mockTrips.find(t => t.id === tripId) || createMockTrip({ id: tripId, name: 'Default Mock Trip' });
      
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify({
            ...trip,
            wineries: trip.wineries || [],
            members: trip.members || []
        }),
      });
    });

    // 2.4.1 Mock the delete trip RPC
    await context.route(/\/rpc\/delete_trip/, (route) => {
      console.log('Mocked delete_trip');
      const body = JSON.parse(route.request().postData() || '{}');
      const tripId = body.p_trip_id;
      mockTrips = mockTrips.filter(t => t.id !== tripId);
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify({ success: true }),
      });
    });

    // 2.4.2 Mock the create trip with winery RPC
    await context.route(/\/rpc\/create_trip_with_winery/, (route) => {
      console.log('Mocked create_trip_with_winery');
      const body = JSON.parse(route.request().postData() || '{}');
      const newTrip = createMockTrip({
          id: Math.floor(Math.random() * 10000),
          name: body.p_trip_name || 'New Trip',
          trip_date: body.p_trip_date || todayCA,
          user_id: 'test-user-id',
          members: ['test-user-id'],
      });
      (newTrip as any).trip_wineries = [{ count: 1 }];
      mockTrips.unshift(newTrip);
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify({ trip_id: newTrip.id }),
      });
    });

    // 2.4.3 Mock the add winery to trip RPC
    await context.route(/\/rpc\/add_winery_to_trip/, (route) => {
      console.log('Mocked add_winery_to_trip');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify({ success: true }),
      });
    });

    // 2.4.4 Mock the get trips for date RPC
    await context.route(/\/rpc\/get_trips_for_date/, (route) => {
      console.log('Mocked get_trips_for_date');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify(mockTrips),
      });
    });

    // 2.5 Mock the paginated wineries RPC (Browse List)
    await context.route(/\/rpc\/get_paginated_wineries/, (route) => {
      console.log('Mocked get_paginated_wineries');
      const mockMarker = createMockMapMarkerRpc({
          google_place_id: 'ch-12345-mock-winery-1' as any,
          name: 'Mock Winery One',
          address: '123 Mockingbird Lane'
      });
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
            ...mockMarker,
            google_rating: 4.5,
            visit_count: 0
        }]),
        headers: { ...commonHeaders, 'x-total-count': '1' }
      });
    });

    // 3. Mock the Supabase RPC for map markers
    await context.route(/\/rpc\/get_map_markers/, (route) => {
      console.log('Mocked get_map_markers');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify([
            createMockMapMarkerRpc({ google_place_id: 'ch-12345-mock-winery-1' as any }),
            createMockMapMarkerRpc({ id: 2 as any, google_place_id: 'ch-67890-mock-winery-2' as any, name: 'Vineyard of Illusion' })
        ]),
      });
    });

    // 3.1 Intercept New Places API requests (Unified Handler)
    await context.route(/.*places\.googleapis\.com.*SearchText/, async (route) => {
      console.log('Mocked SearchText');
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
        headers: commonHeaders,
        body: JSON.stringify({ places }),
      });
    });

    // 4. Mock the Supabase RPC for visit history
    await context.route(/\/rpc\/get_paginated_visits_with_winery_and_friends/, (route) => {
      console.log('Mocked get_paginated_visits');
      const mockVisit = createMockVisitWithWinery({ wineryId: 'ch-12345-mock-winery-1' as any });
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
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
    await context.route(/\/rpc\/log_visit/, (route) => {
      console.log('Mocked log_visit');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify({ visit_id: 'mock-visit-new' }),
      });
    });

    // 6. Mock Visit Mutation RPCs
    await context.route(/\/rpc\/update_visit/, (route) => {
      console.log('Mocked update_visit');
      const mockVisit = createMockVisitWithWinery({ user_review: 'Updated review!', rating: 4, wineryId: 'ch-12345-mock-winery-1' as any });
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
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


    await context.route(/\/rpc\/delete_visit/, (route) => {
      console.log('Mocked delete_visit');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify({ success: true }),
      });
    });

    // 7. Mock List Toggles
    await context.route(/\/rpc\/toggle_wishlist/, (route) => {
      console.log('Mocked toggle_wishlist');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify(true),
      });
    });

    await context.route(/\/rpc\/toggle_favorite/, (route) => {
      console.log('Mocked toggle_favorite');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify(true),
      });
    });

    // 8. Mock delete visit (Supabase REST)
    await context.route(/\/rest\/v1\/visits\?/, (route) => {
      console.log('Mocked visits REST');
      if (route.request().method() === 'DELETE') {
          route.fulfill({ status: 204, headers: commonHeaders });
      } else {
          route.continue();
      }
    });

    // 9. Block costly Google Data APIs LAST
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

  async useRealVisits() {
    const context = this.page.context();
    await context.unroute(/\/rpc\/log_visit/);
    await context.unroute(/\/rpc\/update_visit/);
    await context.unroute(/\/rpc\/delete_visit/);
    await context.unroute(/\/rpc\/get_paginated_visits_with_winery_and_friends/);
  }

  async useRealSocial() {
    const context = this.page.context();
    await context.unroute(/\/rpc\/get_friends_and_requests/);
    await context.unroute(/\/rpc\/send_friend_request/);
    await context.unroute(/\/rpc\/respond_to_friend_request/);
    await context.unroute(/\/rpc\/get_friend_activity_feed/);
  }

  async mockSocial() {
    const context = this.page.context();
    const commonHeaders = { 'Cache-Control': 'no-store' };

    await context.route(/\/rpc\/get_friends_and_requests/, (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: commonHeaders,
            body: JSON.stringify({
                friends: [],
                pending_incoming: [],
                pending_outgoing: []
            })
        });
    });

    await context.route(/\/rpc\/get_friend_activity_feed/, (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: commonHeaders,
            body: JSON.stringify([])
        });
    });
  }

  async failMarkers() {
    const context = this.page.context();
    await context.route(/\/rpc\/get_map_markers/, (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Internal Server Error' }),
      });
    });
  }

  async failTrips() {
    const context = this.page.context();
    await context.route(/\/rest\/v1\/trips/, (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Database Connection Failed' }),
      });
    });
  }

  async failLogin() {
    const context = this.page.context();
    await context.route('**/auth/v1/token**', (route) => {
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
    // Fail on Hydration errors or fatal console errors
    page.on('console', msg => {
        const text = msg.text();
        const isInfrastructureError = text.includes('Error clearing SW/Caches') || 
                                     text.includes('Cross-Origin Request Blocked') ||
                                     text.includes('StorageApiError: Object not found') ||
                                     text.includes('Failed to fetch') ||
                                     text.includes('Load failed') ||
                                     text.includes('Interrupted Hydration') || // Expected during rapid navigations in tests
                                     text.includes('NEXT_NOT_FOUND') || // Expected during certain redirect/404 tests
                                     text.includes('__cf_bm'); // Cloudflare cookie rejection in Firefox (Harmless noise)
        const isIntentionalMockError = text.includes('Internal Server Error') || 
                                      text.includes('Database Connection Failed') ||
                                      text.includes('Hydration failed'); // Next.js logs this when data hydration fails due to 500s
        
        if ((text.includes('Hydration') || text.includes('Error:')) && !isInfrastructureError && !isIntentionalMockError) {
            console.error(`FAILING TEST DUE TO CONSOLE ERROR: ${text}`);
            throw new Error(`Hydration or Fatal Error detected in console: ${text}`);
        }
    });

    // Clear Service Worker caches before each test to prevent mock bypass
    await page.addInitScript(async () => {
        try {
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const registration of registrations) {
                    await registration.unregister();
                }
                const cacheNames = await caches.keys();
                for (const cacheName of cacheNames) {
                    await caches.delete(cacheName);
                }
            }
        } catch (e) {}
    });

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
    } catch (err) {}

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
  } catch (err) {}

  await supabase.auth.admin.deleteUser(userId);
}
