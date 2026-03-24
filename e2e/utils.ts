/* eslint-disable no-console */
/* eslint-disable react-hooks/rules-of-hooks */
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { Page, test as base } from '@playwright/test';
import { createMockMapMarkerRpc, createMockVisitWithWinery, createMockTrip } from '@/lib/test-utils/fixtures';

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
  public static sharedMockTrips: any[] | null = null;
  public static sharedTripMembersMap = new Map<number, any[]>();
  private swEnabled = false;

  static resetSharedState() {
    MockMapsManager.sharedMockTrips = null;
    MockMapsManager.sharedTripMembersMap.clear();
  }

  constructor(private page: Page) {}

  enableServiceWorker() {
    this.swEnabled = true;
  }

  async initDefaultMocks(options: { currentUserId?: string } = {}) {
    if (process.env.E2E_REAL_DATA === 'true') return;
    
    const currentUserId = options.currentUserId || 'test-user-id';
    const context = this.page.context();
    const todayCA = new Date().toLocaleDateString('en-CA');

    const commonHeaders = { 
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-total-count, x-skip-sw-interception',
      'Access-Control-Max-Age': '86400'
    };

    const markers = [
        createMockMapMarkerRpc({ id: 'mock-1' as any, google_place_id: 'ch-12345-mock-winery-1' as any, name: 'Mock Winery One' }),
        createMockMapMarkerRpc({ id: 'mock-2' as any, google_place_id: 'ch-67890-mock-winery-2' as any, name: 'Vineyard of Illusion' }),
        createMockMapMarkerRpc({ id: 'mock-3' as any, google_place_id: 'ch-abcde-mock-winery-3' as any, name: 'The Phantom Cellar' })
    ];

    const catchAllHandler = async (route: any) => {
        const req = route.request();
        const url = req.url();
        const method = req.method();
        const type = req.resourceType();

        if (url.includes('supabase.co')) {
            if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });
            if (url.includes('/rest/v1/profiles')) {
                if (this.realSocialEnabled) return route.fallback();
                return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify([{ id: currentUserId, name: 'Test User', email: 'test@example.com', privacy_level: 'public' }]) });
            }
            if (url.includes('/rpc/')) {
                // EXPLICIT EXCLUSION: Allow test-level interceptors to catch log_visit
                if (url.includes('log_visit')) {
                    return route.fallback();
                }

                if (this.realSocialEnabled && (url.includes('send_friend_request') || url.includes('respond_to_friend_request') || url.includes('get_friends_and_requests') || url.includes('remove_friend'))) {
                    return route.fallback();
                }

                if (url.includes('get_map_markers') || url.includes('get_wineries_in_bounds') || url.includes('get_paginated_wineries')) {
                    return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(markers) });
                }
                if (url.includes('ensure_winery')) {
                    return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(999123) });
                }
                if (url.includes('get_friends_and_requests')) return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ friends: [], pending_incoming: [], pending_outgoing: [] }) });
                if (url.includes('get_paginated_visits')) {
                    if (this.realVisitsEnabled) return route.fallback();
                    const mockVisit = createMockVisitWithWinery({ wineryId: 'ch-67890-mock-winery-2' as any, wineryName: 'Vineyard of Illusion' });
                    return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify([{
                        visit_id: mockVisit.id, user_id: mockVisit.user_id, visit_date: mockVisit.visit_date, user_review: mockVisit.user_review,
                        rating: mockVisit.rating, photos: mockVisit.photos, winery_id: mockVisit.winery_id, winery_name: mockVisit.wineryName,
                        google_place_id: mockVisit.wineryId, winery_address: mockVisit.wineries.address, friend_visits: []
                    }]) });
                }
                return route.fallback();
            }
            if (url.includes('/auth/v1/')) return route.fallback();
            if (url.includes('/rest/v1/trips')) {
                if (this.realVisitsEnabled) return route.fallback();
                const trips = MockMapsManager.sharedMockTrips || [];
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(trips), headers: commonHeaders });
            }
            if (url.includes('/rest/v1/favorites')) {
                if (this.realFavoritesEnabled) return route.fallback();
                return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify([]) });
            }
            if (url.includes('/functions/v1/')) {
                return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true, data: {} }) });
            }
            return route.fallback();
        }

        if (url.includes('google')) {
            if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });
            if (url.includes('maps/api/js') || url.includes('js?key=')) {
                return route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'window.google = { maps: { _isMocked: true, importLibrary: () => Promise.resolve({}), LatLngBounds: function() { this.contains = () => true; this.extend = () => {}; this.getCenter = () => ({lat:()=>42.7,lng:()=>-76.9}); this.getNorthEast=()=>({lat:()=>43,lng:()=>-76}); this.getSouthWest=()=>({lat:()=>42,lng:()=>-77}); }, Geocoder: function() { this.geocode = () => Promise.resolve({results:[]}); }, places: { Place: { searchByText: () => Promise.resolve({places:[]}) } } } };' });
            }
            if (url.includes('searchText')) {
                return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ places: markers.map(m => ({ id: m.google_place_id, name: m.name, displayName: { text: m.name }, formattedAddress: 'Mock NY', location: { latitude: 42.7, longitude: -76.9 }, rating: 4.8 })) }) });
            }
            if (type === 'font' || type === 'stylesheet') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
            if (url.includes('tile')) return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANghjYAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
            console.error(`[BLOCK-FATAL-FORENSIC] ${url}`);
            return route.fulfill({ status: 403, body: 'Blocked' });
        }
        return route.fallback();
    };

    // PROXY REGISTRATION
    // We register on both context and page to be airtight in WebKit
    await context.route('**/*', catchAllHandler);
    await this.page.route('**/*', catchAllHandler);

    if (!MockMapsManager.sharedMockTrips) {
        MockMapsManager.sharedMockTrips = [ createMockTrip({ id: 999, name: 'Collaboration Trip', trip_date: todayCA, user_id: currentUserId }) ];
    }

    // Proactive injection into Store
    await this.page.addInitScript(({ mockMarkers, swEnabled }: any) => {
        // Clear isolated E2E storage for a fresh start
        window.localStorage.removeItem('winery-data-storage-e2e');
        window.localStorage.removeItem('visit-storage-e2e');
        window.localStorage.removeItem('trip-storage-e2e');
        
        (window as any)._E2E_MOCKS_ACTIVE = true;

        if (!swEnabled && 'serviceWorker' in navigator) {
            (navigator.serviceWorker as any).register = () => {
                console.log('[DIAGNOSTIC] SW Registration blocked by MockMapsManager');
                return Promise.reject(new Error('SW blocked for test stability'));
            };
        }
        
        const inject = () => {
            // @ts-ignore
            if (window._E2E_SKIP_WINERY_INJECTION) return false;

            // @ts-ignore
            const wineryStore = window.useWineryDataStore;
            // @ts-ignore
            const mapStore = window.useMapStore;

            if (wineryStore && wineryStore.getState) {
                const state = wineryStore.getState();
                if (state.persistentWineries && state.persistentWineries.length === 0 && mockMarkers.length > 0) {
                    // We manually standardize for the store since the utility isn't easily accessible here
                    const standardized = mockMarkers.map((m: any) => ({
                        id: m.google_place_id,
                        dbId: Number(m.id),
                        name: m.name,
                        address: m.address || 'Mock Address',
                        lat: Number(m.lat),
                        lng: Number(m.lng),
                        rating: Number(m.google_rating) || 4.5,
                        userVisited: false,
                        onWishlist: false,
                        isFavorite: false,
                        visits: [],
                        openingHours: null, // PREVENT LAZY LOAD
                        reviews: []
                    }));
                    wineryStore.setState({ persistentWineries: standardized });
                }
            }

            if (mapStore && mapStore.getState) {
                const state = mapStore.getState();
                if (!state.bounds) {
                    mapStore.setState({ 
                        bounds: { 
                            getNorthEast: () => ({ lat: () => 43, lng: () => -76 }),
                            getSouthWest: () => ({ lat: () => 42, lng: () => -77 }),
                            getCenter: () => ({ lat: () => 42.5, lng: () => -76.5 }),
                            contains: () => true,
                            extend: () => {}
                        } 
                    });
                }
            }
            
            // @ts-ignore
            if (window.google && window.google.maps) {
                const maps = window.google.maps;
                if (maps.LatLngBounds) maps.LatLngBounds.prototype.contains = () => true;
                return true;
            }
            return false;
        };
        // Interval ensures we catch the store even if hydration lags
        const intervalId = setInterval(() => {
            if (inject()) {
                // Once injected and maps ready, we can slow down or stop
                // But keeping it running briefly helps with hydration flashes
            }
        }, 100);
        setTimeout(() => clearInterval(intervalId), 10000);
    }, { mockMarkers: markers, swEnabled: this.swEnabled } as any);
  }

  // --- ERROR INJECTION METHODS (Restored for error-handling.spec.ts) ---
  async failMarkers() {
    await this.page.addInitScript(() => {
        (window as any)._E2E_SKIP_WINERY_INJECTION = true;
    });
    await this.page.route(/\/rpc\/get_map_markers/, async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ message: 'Internal Server Error' }) });
    });
  }

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

  async useRealSocial() { this.realSocialEnabled = true; }
  async useRealFavorites() { this.realFavoritesEnabled = true; }
  async useRealVisits() { this.realVisitsEnabled = true; }
}

export const test = base.extend<{
  mockMaps: MockMapsManager;
  user: TestUser;
}>({
  mockMaps: [async ({ page }, use, testInfo) => {
    MockMapsManager.resetSharedState();
    const manager = new MockMapsManager(page);
    if (testInfo.file.includes('pwa-')) { manager.enableServiceWorker(); }
    
    const logHandler = (msg: any) => {
        const text = msg.text();
        const type = msg.type();

        // Only log real errors that aren't diagnostic/sync noise
        if (text.includes('[DIAGNOSTIC]')) {
            console.log(text);
        } else if (type === 'error' && !text.includes('[Sync]')) {
            console.log(`[BROWSER-${type.toUpperCase()}] ${text}`);
        }

        if (text.includes('Hydration') || text.includes('Error') || type === 'error' || text.includes('403')) {
            if (text.includes('[DIAGNOSTIC]')) return; // Ignore diagnostics in fatal error check

            // Log the message for debugging
            if (text.includes('403')) {
                console.log(`[DIAGNOSTIC] Seen 403 error: ${text}`);
            }

            const isInfrastructure = text.includes('SecurityError') || 
                                   text.includes('IDBFactory') || 
                                   text.includes('Cross-Origin Request Blocked') ||
                                   text.includes('Failed to load resource');
            
            const isExpectedOfflineError = text.includes('Edge Function failed') || 
                                         text.includes('FunctionsHttpError') || 
                                         text.includes('Load failed') || 
                                         text.includes('TypeError') ||
                                         text.includes('[Sync] Failed') ||
                                         text.includes('Database Connection Failed') ||
                                         text.includes('Internal Server Error') ||
                                         text.includes('JSHandle@object');
            
            if (!isInfrastructure && !isExpectedOfflineError) {
                console.error(`FAILING TEST DUE TO CONSOLE ERROR: ${text}`);
                throw new Error(`Fatal Error: ${text}`);
            }
        }
    };

    page.on('console', logHandler);
    page.context().on('console', logHandler);

    await manager.initDefaultMocks();
    await use(manager);
  }, { auto: true }],

  user: async ({}, use) => {
    const email = `test-${uuidv4()}@example.com`;
    const password = `pass-${uuidv4()}`;
    const name = `User-${uuidv4().substring(0, 8)}`;
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
    if (error || !data.user) throw new Error(`Failed: ${error?.message}`);
    await supabase.from('profiles').upsert({ id: data.user.id, email, name, privacy_level: 'public' });
    const testUser = { id: data.user.id, email, password };
    await use(testUser);
    await supabase.auth.admin.deleteUser(testUser.id);
  }
});

export { expect } from '@playwright/test';

// --- LEGACY EXPORTS (Restored for visual.spec.ts and others) ---
/** @deprecated Use mockMaps fixture */
export async function mockGoogleMapsApi(page: Page, userId?: string) {
  const manager = new MockMapsManager(page);
  await manager.initDefaultMocks({ currentUserId: userId });
}

/** @deprecated Use user fixture */
export async function createTestUser(): Promise<TestUser> {
  const email = `test-${uuidv4()}@example.com`;
  const password = `pass-${uuidv4()}`;
  const name = `User-${uuidv4().substring(0, 8)}`;
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (error || !data.user) throw new Error(`Failed: ${error?.message}`);
  await supabase.from('profiles').upsert({ id: data.user.id, email, name, privacy_level: 'public' });
  return { id: data.user.id, email, password };
}

/** @deprecated Use user fixture */
export async function deleteTestUser(userId: string): Promise<void> {
  await supabase.auth.admin.deleteUser(userId);
}
