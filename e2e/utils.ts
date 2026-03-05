/* eslint-disable no-console */
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

export const supabase = createClient(supabaseUrl, serviceRoleKey);

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
  private realSocialEnabled = false;
  private realVisitsEnabled = false;
  private realFavoritesEnabled = false;

  constructor(private page: Page) {}

  /**
   * Enable service worker for high-fidelity PWA testing.
   */
  enableServiceWorker() {
    this.allowServiceWorker = true;
  }

  /**
   * Enable real social RPCs.
   */
  async useRealSocial() {
    this.realSocialEnabled = true;
    const context = this.page.context();
    await context.unroute(/\/rpc\/get_friends_and_requests/);
    await context.unroute(/\/rpc\/send_friend_request/);
    await context.unroute(/\/rpc\/respond_to_friend_request/);
    await context.unroute(/\/rpc\/get_friend_activity_feed/);
    await context.unroute(/\/rpc\/get_friend_profile_with_visits/);
  }

  /**
   * Enable real visit RPCs.
   */
  async useRealVisits() {
    this.realVisitsEnabled = true;
    const context = this.page.context();
    await context.unroute(/\/rpc\/log_visit/);
    await context.unroute(/\/rpc\/update_visit/);
    await context.unroute(/\/rpc\/delete_visit/);
    await context.unroute(/\/rpc\/get_paginated_visits_with_winery_and_friends/);
  }

  /**
   * Enable real favorite/wishlist RPCs.
   */
  async useRealFavorites() {
    this.realFavoritesEnabled = true;
    const context = this.page.context();
    await context.unroute(/\/rpc\/toggle_favorite/);
    await context.unroute(/\/rpc\/toggle_wishlist/);
    await context.unroute(/\/rpc\/toggle_favorite_privacy/);
    await context.unroute(/\/rpc\/toggle_wishlist_privacy/);
    await context.unroute(/\/rpc\/get_friend_profile_with_visits/);
    await context.unroute(/\/rpc\/get_map_markers/);
  }

  /**
   * Initializes default mocks for Google Maps and Supabase RPCs.
   * This is called automatically by the mockMaps fixture.
   */
  async initDefaultMocks(options: { realFavorites?: boolean } = {}) {
    if (process.env.E2E_REAL_DATA === 'true') return;
    
    if (options.realFavorites) {
        this.realFavoritesEnabled = true;
    }

    // Use context-level routing to ensure Service Worker requests are intercepted
    const context = this.page.context();
    const mockWinery = createMockWinery({ id: 'ch-12345-mock-winery-1' as any });
    const todayCA = new Date().toLocaleDateString('en-CA');

    const commonHeaders = { 
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*'
    };

    // 0. BLOCK Costly APIs FIRST (with exclusions)
    // This provides a baseline safety net while allowing specific mocks to win.
    const blockDataApis = async (router: { route: (pattern: any, handler: any) => Promise<void> }) => {
        await router.route(/(google|googleapis|places)/, async (route: any) => {
          const url = route.request().url();
          const type = route.request().resourceType();

          // ALWAYS ALLOW specific mocked endpoints or core assets
          if (url.match(/searchText/i) || url.includes('get-winery-details') || url.includes('rpc') || url.includes('rest/v1') || url.includes('google-maps-tiles') || url.includes('kh?')) {
              return route.continue();
          }

          if (type === 'script' || type === 'font' || type === 'stylesheet' || url.includes('js?key=')) {
            return route.continue();
          }

          if (url.includes('vt?') || url.includes('kh?')) {
              await route.fulfill({
                  contentType: 'image/png',
                  headers: { 'Access-Control-Allow-Origin': '*' },
                  body: Buffer.from('iVBORw0KGgoAAAANghjYAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
              });
              return;
          }

          console.log(`[BLOCK] Aborting costly API request: ${url}`);
          await route.abort('failed');
        });
    };

    await blockDataApis(context);

    // 0.1 Conditionally Block Service Worker Registration and Clear All Caches
    if (!this.allowServiceWorker) {
        await context.route('**/sw.js', route => route.abort());
        await this.page.addInitScript(async () => {
            // 1. Block future registrations
            if (navigator.serviceWorker) {
                (navigator.serviceWorker as any).register = () => Promise.reject(new Error('SW registration blocked by test'));
            }
            // 2. Clear existing registrations
            if (window.navigator && window.navigator.serviceWorker) {
                const regs = await window.navigator.serviceWorker.getRegistrations();
                for (const reg of regs) await reg.unregister();
            }
            // 3. Clear ALL caches
            if (window.caches) {
                const names = await window.caches.keys();
                for (const name of names) await window.caches.delete(name);
            }
        });
    }

    // 0.2 PROACTIVE BLOCKING: Intercept New Places API requests IMMEDIATELY (Unified Handler)
    // Use regex for case-insensitive matching of searchText
    await context.route(/\/places\.googleapis\.com.*searchText/i, async (route) => {
      console.log('Mocked SearchText (Context Level)');
      // Always include Vineyard of Illusion in the proactive mock to satisfy PWA tests
      const places = [
          {
            id: 'ch-67890-mock-winery-2',
            google_place_id: 'ch-67890-mock-winery-2',
            name: 'Vineyard of Illusion',
            displayName: { text: 'Vineyard of Illusion' },
            formattedAddress: '456 Mirage Way, Ghost Town, NY 12345',
            location: { latitude: 42.7, longitude: -76.9 },
            rating: 4.8
          },
          ...mockPlacesSearch.map(p => ({
            id: p.id,
            google_place_id: p.id,
            name: p.displayName,
            displayName: { text: p.displayName },
            formattedAddress: p.formattedAddress,
            location: {
              latitude: p.location.latitude,
              longitude: p.location.longitude
            },
            rating: p.rating
          }))
      ];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify({ places }),
      });
    });

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
                  // Always include Vineyard of Illusion in the searchByText mock
                  const places = [
                      {
                          id: 'ch-67890-mock-winery-2',
                          displayName: 'Vineyard of Illusion',
                          formattedAddress: '456 Mirage Way, Ghost Town, NY 12345',
                          location: { lat: () => 42.7, lng: () => -76.9 },
                          fetchFields: () => Promise.resolve()
                      },
                      ...mockPlaces.map(p => ({
                          ...p,
                          location: {
                              lat: () => p.location.latitude,
                              lng: () => p.location.longitude
                          },
                          fetchFields: () => Promise.resolve() // Mock fetchFields for lazy Detail calls
                      }))
                  ];
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
            if (applyMocks()) {
                console.log('[MockMapsManager] Mocks applied successfully via interval');
                clearInterval(interval);
            }
          }, 50); // Faster polling for WebKit
      }
    }, mockPlacesSearch);

    // 1.2 Mock Social RPCs
    if (!this.realSocialEnabled) {
        await this.mockSocial();
    }

    // 2. Mock the Supabase Edge Function for winery details
    await context.route(/\/functions\/v1\/get-winery-details/, async (route) => {
      console.log('Mocked get-winery-details');
      await route.fulfill({
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
    await context.route(/\/rpc\/get_wineries_in_bounds/, async (route) => {
      console.log('Mocked get_wineries_in_bounds');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify([
            createMockMapMarkerRpc({ id: 'mock-1' as any, google_place_id: 'ch-12345-mock-winery-1' as any }),
            createMockMapMarkerRpc({ id: 'mock-2' as any, google_place_id: 'ch-67890-mock-winery-2' as any, name: 'Vineyard of Illusion' })
        ]),
      });
    });

    // 2.2 Mock the Supabase REST endpoint for trips (Stateful)
    let mockTrips: any[] = [];

    await context.route(/\/rest\/v1\/trips/, async (route) => {
      console.log('Mocked /rest/v1/trips');
      const method = route.request().method();
      const url = route.request().url();
      
      if (method === 'GET') {
        const count = mockTrips.length;
        if (url.includes('trip_wineries')) {
            // Main list fetch
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockTrips),
                headers: { ...commonHeaders, 'content-range': count > 0 ? `0-${count - 1}/${count}` : '*/0' }
            });
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockTrips),
            headers: commonHeaders
        });
        return;
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
          await route.fulfill({
              status: 201,
              contentType: 'application/json',
              body: JSON.stringify(newTrip),
              headers: commonHeaders
          });
          return;
      }

      if (method === 'PATCH') {
          const body = JSON.parse(route.request().postData() || '{}');
          const idMatch = url.match(/id=eq\.(\d+)/);
          const id = idMatch ? parseInt(idMatch[1], 10) : null;
          if (id !== null) {
              mockTrips = mockTrips.map(t => t.id === id ? { ...t, ...body } : t);
          }
          await route.fulfill({ status: 204, headers: commonHeaders });
          return;
      }

      if (method === 'DELETE') {
          const idMatch = url.match(/id=eq\.(\d+)/);
          const id = idMatch ? parseInt(idMatch[1], 10) : null;
          if (id !== null) {
              mockTrips = mockTrips.filter(t => t.id !== id);
          }
          await route.fulfill({ status: 204, headers: commonHeaders });
          return;
      }

      await route.continue();
    });

    // 2.3 Mock the upcoming trips RPC
    await context.route(/\/rpc\/get_upcoming_trips/, async (route) => {
      console.log('Mocked get_upcoming_trips');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTrips),
        headers: commonHeaders
      });
    });

    // 2.4 Mock the trip details RPC
    await context.route(/\/rpc\/get_trip_details/, async (route) => {
      console.log('Mocked get_trip_details');
      const body = JSON.parse(route.request().postData() || '{}');
      const tripId = body.trip_id_param;
      const trip = mockTrips.find(t => t.id === tripId) || createMockTrip({ id: tripId, name: 'Default Mock Trip' });
      
      await route.fulfill({
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
    await context.route(/\/rpc\/delete_trip/, async (route) => {
      console.log('Mocked delete_trip');
      const body = JSON.parse(route.request().postData() || '{}');
      const tripId = body.p_trip_id;
      mockTrips = mockTrips.filter(t => t.id !== tripId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify({ success: true }),
      });
    });

    // 2.4.2 Mock the create trip with winery RPC
    await context.route(/\/rpc\/create_trip_with_winery/, async (route) => {
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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify({ trip_id: newTrip.id }),
      });
    });

    // 2.4.3 Mock the add winery to trip RPC
    await context.route(/\/rpc\/add_winery_to_trip/, async (route) => {
      console.log('Mocked add_winery_to_trip');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify({ success: true }),
      });
    });

    // 2.4.4 Mock the get trips for date RPC
    await context.route(/\/rpc\/get_trips_for_date/, async (route) => {
      console.log('Mocked get_trips_for_date');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify(mockTrips),
      });
    });

    // 2.5 Mock the paginated wineries RPC (Browse List)
    await context.route(/\/rpc\/get_paginated_wineries/, async (route) => {
      console.log('Mocked get_paginated_wineries');
      const mockMarker = createMockMapMarkerRpc({
          id: 'mock-1' as any,
          google_place_id: 'ch-12345-mock-winery-1' as any,
          name: 'Mock Winery One',
          address: '123 Mockingbird Lane'
      });
      await route.fulfill({
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
    await context.route(/\/rpc\/get_map_markers/, async (route) => {
      console.log('Mocked get_map_markers');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify([
            createMockMapMarkerRpc({ id: 'mock-1' as any, google_place_id: 'ch-12345-mock-winery-1' as any }),
            createMockMapMarkerRpc({ id: 'mock-2' as any, google_place_id: 'ch-67890-mock-winery-2' as any, name: 'Vineyard of Illusion' })
        ]),
      });
    });

    // 4. Mock the Supabase RPC for visit history
    if (!this.realVisitsEnabled) {
        await context.route(/\/rpc\/get_paginated_visits_with_winery_and_friends/, async (route) => {
          console.log('Mocked get_paginated_visits');
          const mockVisit = createMockVisitWithWinery({ wineryId: 'ch-12345-mock-winery-1' as any });
          await route.fulfill({
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
        await context.route(/\/rpc\/log_visit/, async (route) => {
          console.log('Mocked log_visit');
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: commonHeaders,
            body: JSON.stringify({ visit_id: 'mock-visit-new' }),
          });
        });

        // 6. Mock Visit Mutation RPCs
        await context.route(/\/rpc\/update_visit/, async (route) => {
          console.log('Mocked update_visit');
          const mockVisit = createMockVisitWithWinery({ user_review: 'Updated review!', rating: 4, wineryId: 'ch-12345-mock-winery-1' as any });
          await route.fulfill({
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


        await context.route(/\/rpc\/delete_visit/, async (route) => {
          console.log('Mocked delete_visit');
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: commonHeaders,
            body: JSON.stringify({ success: true }),
          });
        });
    }

    // 7. List Toggles
    if (this.realFavoritesEnabled) {
        await context.unroute(/\/rpc\/toggle_favorite/);
        await context.unroute(/\/rpc\/toggle_wishlist/);
        await context.unroute(/\/rpc\/toggle_favorite_privacy/);
        await context.unroute(/\/rpc\/toggle_wishlist_privacy/);
        await context.unroute(/\/rpc\/get_friend_profile_with_visits/);
    } else {
        await context.route(/\/rpc\/toggle_wishlist/, async (route) => {
          console.log('Mocked toggle_wishlist');
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: commonHeaders,
            body: JSON.stringify(true),
          });
        });

        await context.route(/\/rpc\/toggle_favorite/, async (route) => {
          console.log('Mocked toggle_favorite');
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: commonHeaders,
            body: JSON.stringify(true),
          });
        });

        await context.route(/\/rpc\/toggle_favorite_privacy/, async (route) => {
            console.log('Mocked toggle_favorite_privacy');
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              headers: commonHeaders,
              body: JSON.stringify({ success: true, is_private: true }),
            });
        });

        await context.route(/\/rpc\/toggle_wishlist_privacy/, async (route) => {
            console.log('Mocked toggle_wishlist_privacy');
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              headers: commonHeaders,
              body: JSON.stringify({ success: true, is_private: true }),
            });
        });

        // 7.1 Mock Friend Profile RPC if not real
        await context.route(/\/rpc\/get_friend_profile_with_visits/, async (route) => {
            console.log('Mocked get_friend_profile_with_visits');
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                headers: commonHeaders,
                body: JSON.stringify({
                    profile: { id: 'friend-1', name: 'Mock Friend', email: 'friend@ex.com', privacy_level: 'public' },
                    visits: [],
                    stats: { visit_count: 0, favorite_count: 1, wishlist_count: 1 }
                })
            });
        });
    }

    // 8. Mock delete visit (Supabase REST)
    await context.route(/\/rest\/v1\/visits\?/, async (route) => {
      console.log('Mocked visits REST');
      if (route.request().method() === 'DELETE') {
          await route.fulfill({ status: 204, headers: commonHeaders });
      } else {
          await route.continue();
      }
    });
  }

  async mockSocial() {
    const context = this.page.context();
    const commonHeaders = { 
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*' 
    };

    await context.route(/\/rpc\/get_friends_and_requests/, async (route) => {
        await route.fulfill({
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

    await context.route(/\/rpc\/get_friend_activity_feed/, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: commonHeaders,
            body: JSON.stringify([])
        });
    });
  }

  async failMarkers() {
    const context = this.page.context();
    await context.route(/\/rpc\/get_map_markers/, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ message: 'Internal Server Error' }),
      });
    });
  }

  async failTrips() {
    const context = this.page.context();
    await context.route(/\/rest\/v1\/trips/, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ message: 'Database Connection Failed' }),
      });
    });
  }

  async failLogin() {
    const context = this.page.context();
    await context.route('**/auth/v1/token**', async (route) => {
      await route.fulfill({
          status: 400,
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': '*' },
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
  mockMaps: [async ({ page }, use, testInfo) => {
    const manager = new MockMapsManager(page);
    
    // Automatically enable Service Worker for PWA-specific test files
    if (testInfo.file.includes('pwa-')) {
      manager.enableServiceWorker();
    }

    // Surface all console messages for debugging
    page.on('console', msg => {
        const text = msg.text();
        console.log(`[Browser ${msg.type()}] ${text}`);
    });

    // Fail on Hydration errors or fatal console errors
    page.on('console', msg => {
        const text = msg.text();
        const isInfrastructureError = text.includes('Error clearing SW/Caches') || 
                                     text.includes('SecurityError') || 
                                     text.includes('IDBFactory') ||
                                     text.includes('Access to the IndexedDB API is denied') ||
                                     text.includes('Cross-Origin Request Blocked') ||
                                     text.includes('StorageApiError: Object not found') ||
                                     text.includes('Failed to fetch') ||
                                     text.includes('Load failed') ||
                                     text.includes('Interrupted Hydration') || 
                                     text.includes('NEXT_NOT_FOUND') || 
                                     text.includes('SW registration blocked by test') || 
                                     text.includes('[DIAGNOSTIC]') || 
                                     text.includes('Failed to load resource') || 
                                     text.includes('Edge Function failed') || // Allow WebKit/Safari Edge Function errors
                                     text.includes('Unable to fetch configuration for mapId') || 
                                     text.includes('__cf_bm') ||
                                     text.includes('wasm') || // Allow WebKit WASM side-effects
                                     text.includes('NetworkError') || // Allow WebKit network side-effects
                                     text.includes('The Google Maps JavaScript API could not load') || // Allow WebKit API load failures
                                     text.includes('Web Inspector blocked'); 
                                     
        const isIntentionalMockError = text.includes('Internal Server Error') || 
                                      text.includes('Database Connection Failed') ||
                                      text.includes('FunctionsFetchError') ||
                                      text.includes('Hydration failed');
        
        // Match the stable logic pattern: only fail on specific substrings, not generic 'error' type
        const isError = text.includes('Hydration') || text.includes('Error:');
        
        if (isError && !isInfrastructureError && !isIntentionalMockError) {
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
        } catch (e) {
            // Silently fail on security errors during cleanup
            if (e instanceof Error && e.name !== 'SecurityError') {
                console.warn('Non-security error clearing SW/Caches:', e.message);
            }
        }
    });

    // Check if the test file is item-privacy.spec.ts to pass realFavorites: true
    const isItemPrivacyTest = testInfo.file.includes('item-privacy.spec.ts');
    await manager.initDefaultMocks({ realFavorites: isItemPrivacyTest });
    
    await use(manager);
  }, { auto: true }],

  user: async ({}, use) => {
    const email = `test-${uuidv4()}@example.com`;
    const password = `pass-${uuidv4()}`;
    const name = `User-${uuidv4().substring(0, 8)}`;
    const { data, error } = await supabase.auth.admin.createUser({ 
        email, 
        password, 
        email_confirm: true,
        user_metadata: { name }
    });
    
    if (error || !data.user) throw new Error(`Failed to create test user: ${error?.message}`);
    
    // Use upsert to ensure the profile exists immediately
    await supabase.from('profiles').upsert({ 
        id: data.user.id, 
        email, 
        name,
        privacy_level: 'public' 
    });

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
  const name = `User-${uuidv4().substring(0, 8)}`;
  const { data, error } = await supabase.auth.admin.createUser({ 
      email, 
      password, 
      email_confirm: true,
      user_metadata: { name }
  });
  if (error || !data.user) throw new Error(`Failed: ${error?.message}`);
  
  // Use upsert to ensure the profile exists
  await supabase.from('profiles').upsert({ 
      id: data.user.id, 
      email, 
      name,
      privacy_level: 'public'
  });

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
