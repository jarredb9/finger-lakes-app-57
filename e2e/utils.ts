/* eslint-disable no-console */
/* eslint-disable react-hooks/rules-of-hooks */
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { Page, test as base } from '@playwright/test';
import { WineryDbId, GooglePlaceId } from '@/lib/types';
import { createMockTrip, createMockVisitWithWinery } from '@/lib/test-utils/fixtures';
export { createMockTrip, createMockVisitWithWinery };

export class MockMapsManager {
  private page: Page;
  private swEnabled = false;

  // Shared state between contexts (simulates server-side DB)
  static sharedMockTrips: any[] | null = null;
  static sharedMockVisits: any[] | null = null;
  static sharedMockActivityFeed: any[] | null = null;
  static sharedMockSocial: { friends: any[], pending_incoming: any[], pending_outgoing: any[] } | null = null;
  static sharedMockSocialMap: Map<string, { friends: any[], pending_incoming: any[], pending_outgoing: any[] }> = new Map();

  constructor(page: Page) {
    this.page = page;
  }

  static resetSharedState() {
    this.sharedMockTrips = null;
    this.sharedMockVisits = null;
    this.sharedMockActivityFeed = null;
    this.sharedMockSocial = null;
    this.sharedMockSocialMap.clear();
  }

  async enableServiceWorker() {
    this.swEnabled = true;
  }

  async failMarkers() {
    // We set a flag that the app-side store listener will pick up
    await this.page.addInitScript(() => {
        console.log('[DIAGNOSTIC] failMarkers init script running');
        (window as any)._E2E_ENABLE_REAL_SYNC = true;
        (window as any)._E2E_SKIP_WINERY_INJECTION = true;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('_E2E_ENABLE_REAL_SYNC', 'true');
            localStorage.removeItem('winery-data-storage-e2e');
        }
    });
    // Also try to set it immediately
    await this.page.evaluate(() => {
        (window as any)._E2E_ENABLE_REAL_SYNC = true;
        (window as any)._E2E_SKIP_WINERY_INJECTION = true;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('_E2E_ENABLE_REAL_SYNC', 'true');
            localStorage.removeItem('winery-data-storage-e2e');
        }
    }).catch(() => {});
  }

  async initDefaultMocks(options: { markers?: any[], currentUserId?: string } = {}) {
    const { markers = [], currentUserId = 'test-user-id' } = options;
    const commonHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PATCH',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-skip-sw-interception',
    };

    const catchAllHandler = async (route: any) => {
        const url = route.request().url();
        const method = route.request().method();

        if (url.includes('supabase.co')) {
            if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });

            if (url.includes('rpc/')) {
                if (url.includes('get_map_markers')) {
                    console.log(`[DIAGNOSTIC] Fulfilling Map RPC: ${url}`);
                    return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(markers) });
                }
                
                if (url.includes('get_friends_and_requests')) {
                    if (this.realSocialEnabled) return route.fallback();
                    console.log(`[DIAGNOSTIC] Fulfilling Mock Social RPC: ${url}`);
                    return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(MockMapsManager.sharedMockSocial || { friends: [], pending_incoming: [], pending_outgoing: [] }) });
                }

                if (url.includes('get_friend_activity_feed')) {
                    if (this.realSocialEnabled) return route.fallback();
                    console.log(`[DIAGNOSTIC] Fulfilling Mock Activity Feed RPC: ${url}`);
                    return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(MockMapsManager.sharedMockActivityFeed || []) });
                }

                if (url.includes('get_friend_profile_with_visits')) {
                    const friendId = url.split('friend_id_param=')[1]?.split('&')[0];
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        headers: commonHeaders,
                        body: JSON.stringify({
                            profile: { id: friendId, name: 'Mock Friend', email: 'friend@example.com', privacy_level: 'public' },
                            visits: [],
                            stats: { visit_count: 0, wishlist_count: 0, favorite_count: 0 }
                        })
                    });
                }
            }
        }

        if (url.includes('google')) {
            if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });
            if (url.includes('maps/api/js') || url.includes('js?key=')) {
                return route.fulfill({ 
                    status: 200, 
                    contentType: 'application/javascript', 
                    headers: { 'Access-Control-Allow-Origin': '*' }, 
                    body: `
                        window.google = { 
                            maps: { 
                                _isMocked: true, 
                                importLibrary: () => Promise.resolve({}), 
                                LatLngBounds: function() { 
                                    this.contains = () => true; 
                                    this.extend = () => {}; 
                                    this.getCenter = () => ({lat:()=>42.7,lng:()=>-76.9}); 
                                    this.getNorthEast=()=>({lat:()=>43,lng:()=>-76}); 
                                    this.getSouthWest=()=>({lat:()=>42,lng:()=>-77}); 
                                }, 
                                event: {
                                    addListener: (obj, ev, cb) => {
                                        if (ev === 'idle' || ev === 'tilesloaded') setTimeout(cb, 100);
                                        return { remove: () => {} };
                                    },
                                    trigger: () => {}
                                },
                                Map: function(el) {
                                    this.addListener = (ev, cb) => {
                                        if (ev === 'idle') setTimeout(cb, 100);
                                        return { remove: () => {} };
                                    };
                                    this.getBounds = () => new google.maps.LatLngBounds();
                                    this.getZoom = () => 12;
                                    this.setCenter = () => {};
                                    this.setZoom = () => {};
                                    this.fitBounds = () => {};
                                },
                                Marker: function() {
                                    this.setMap = () => {};
                                    this.setPosition = () => {};
                                },
                                Geocoder: function() { 
                                    this.geocode = () => Promise.resolve({results:[]}); 
                                }, 
                                places: { 
                                    Place: function() {
                                        this.fetchFields = () => Promise.resolve();
                                    }
                                } 
                            } 
                        };
                    ` 
                });
            }
            if (url.includes('searchText')) {
                return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ places: markers.map(m => ({ id: m.google_place_id, name: m.name, displayName: { text: m.name }, formattedAddress: 'Mock NY', location: { latitude: 42.7, longitude: -76.9 }, rating: 4.8 })) }) });
            }
        }

        return route.fallback();
    };

    await this.page.route('**/*', catchAllHandler);

    if (!MockMapsManager.sharedMockVisits) {
        const mockVisit = createMockVisitWithWinery({
            id: 'ch-67890-mock-winery-2' as GooglePlaceId,
            wineryName: 'Vineyard of Illusion',
            visit_date: '2020-01-01',
            user_review: 'A classic mock visit from the past.'
        });
        MockMapsManager.sharedMockVisits = [{
            visit_id: 12345,
            user_id: mockVisit.user_id || currentUserId,
            visit_date: mockVisit.visit_date,
            user_review: mockVisit.user_review || null,
            rating: mockVisit.rating || null,
            photos: mockVisit.photos || null,
            winery_id: mockVisit.winery_id || 2 as WineryDbId,
            winery_name: mockVisit.wineryName || 'Vineyard of Illusion',
            google_place_id: mockVisit.wineryId || 'ch-67890-mock-winery-2' as GooglePlaceId,
            winery_address: mockVisit.wineries.address,
            friend_visits: []
        }];
    }

    if (!MockMapsManager.sharedMockTrips) {
        MockMapsManager.sharedMockTrips = [
            createMockTrip({ id: 1, name: 'Initial Mock Trip', user_id: currentUserId })
        ];
    }

    // Default social state if not set
    if (!MockMapsManager.sharedMockSocial) {
        MockMapsManager.sharedMockSocial = { friends: [], pending_incoming: [], pending_outgoing: [] };
    }

    // EXPOSE FLAGS TO CLIENT
    // This tells the app-side store to use real sync/RPCs for specific operations
    await this.page.addInitScript(({ mockMarkers, swEnabled, realFavoritesEnabled, realVisitsEnabled, realTripsEnabled }: any) => {
        (window as any)._E2E_SKIP_WINERY_INJECTION = false;
        (window as any)._E2E_ENABLE_REAL_SYNC = realFavoritesEnabled || realVisitsEnabled || realTripsEnabled;
        
        // Block service worker registration if requested
        if (!swEnabled && 'serviceWorker' in navigator) {
            (navigator.serviceWorker as any).register = () => {
                console.log('[DIAGNOSTIC] Blocked Service Worker registration');
                return new Promise(() => {});
            };
        }

        const inject = () => {
            // @ts-ignore
            const store = window.useWineryDataStore?.getState();
            if (store && store.persistentWineries.length === 0 && !(window as any)._E2E_SKIP_WINERY_INJECTION) {
                console.log('[DIAGNOSTIC] Injecting mock markers into store');
                store.set({ persistentWineries: mockMarkers });
                return true;
            }
            return false;
        };

        const intervalId = setInterval(() => {
            if (inject()) {
                // Once injected and maps ready, we can slow down or stop
            }
        }, 100);
        setTimeout(() => clearInterval(intervalId), 10000);
    }, {
        mockMarkers: markers,
        swEnabled: this.swEnabled,
        realFavoritesEnabled: this.realFavoritesEnabled,
        realVisitsEnabled: this.realVisitsEnabled,
        realTripsEnabled: this.realTripsEnabled
    });
  }

  // --- ERROR INJECTION METHODS ---
  async failTrips() {
    await this.page.route(/\/rest\/v1\/trips/, async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ message: 'Database Connection Failed' }) });
    });
  }

  async failLogin() {
    await this.page.route('**/auth/v1/token**', async (route) => {
      await route.fulfill({ status: 400, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }) });
    });
  }

  // --- LEGACY FLAGS (Restored for spec file compatibility) ---
  realSocialEnabled = false;
  realFavoritesEnabled = false;
  realVisitsEnabled = false;
  realTripsEnabled = false;

  async useRealSocial() { this.realSocialEnabled = true; }
  async useRealFavorites() { this.realFavoritesEnabled = true; }
  async useRealVisits() { this.realVisitsEnabled = true; }
  async useRealTrips() { this.realTripsEnabled = true; }
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

export const test = base.extend<{
  mockMaps: MockMapsManager;
  user: TestUser;
}>({
  mockMaps: async ({ page }, use) => {
    const manager = new MockMapsManager(page);
    await use(manager);
  },
  user: async ({}, use) => {
    const user = await createTestUser();
    await use(user);
  }
});

export const expect = base.expect;

// Helper to create ephemeral Supabase user
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function createTestUser(): Promise<TestUser> {
  const email = `test-${uuidv4()}@example.com`;
  const password = 'Password123!';
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error || new Error('Failed to create user');
  
  // Ensure profile exists
  await supabase.from('profiles').insert({ id: data.user.id, email, name: email.split('@')[0], privacy_level: 'public' });
  return { id: data.user.id, email, password };
}

/** @deprecated Use user fixture */
export async function deleteTestUser(userId: string): Promise<void> {
  await supabase.auth.admin.deleteUser(userId);
}

/** @deprecated Use mockMaps fixture */
export async function mockGoogleMapsApi(page: Page, userId?: string) {
  const manager = new MockMapsManager(page);
  await manager.initDefaultMocks({ currentUserId: userId });
}
