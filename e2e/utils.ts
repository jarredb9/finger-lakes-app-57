/* eslint-disable no-console */
/* eslint-disable react-hooks/rules-of-hooks */
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { Page, test as base } from '@playwright/test';
import { createMockMapMarkerRpc, createMockVisitWithWinery, createMockTrip } from '@/lib/test-utils/fixtures';
import { 
  Trip, 
  VisitWithWinery, 
  MapMarkerRpc, 
  TripMember,
  WineryDbId,
  GooglePlaceId
} from '@/lib/types';

export interface FriendActivityFeedItem {
  activity_type: string;
  created_at: string;
  activity_user_id: string;
  user_name: string;
  user_email: string;
  winery_id: number;
  winery_name: string;
  visit_rating: number | null;
  visit_review: string | null;
  visit_photos: string[] | null;
}

export type MapMarker = MapMarkerRpc;
export type TripDetails = Trip;
export type VisitItem = VisitWithWinery;

/**
 * Specifically matches the return type of get_paginated_visits_with_winery_and_friends RPC
 */
export interface RpcVisitWithWinery {
  visit_id: number;
  user_id: string;
  visit_date: string;
  user_review: string | null;
  rating: number | null;
  photos: string[] | null;
  winery_id: number;
  winery_name: string;
  google_place_id: string;
  winery_address: string;
  friend_visits: any[];
}

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
  public static sharedMockTrips: Trip[] | null = null;
  public static sharedMockVisits: RpcVisitWithWinery[] | null = null;
  public static sharedMockActivityFeed: FriendActivityFeedItem[] | null = null;
  public static sharedMockSocial: {
      friends: any[],
      pending_incoming: any[],
      pending_outgoing: any[]
  } | null = null;
  public static sharedMockSocialMap = new Map<string, {
      friends: any[],
      pending_incoming: any[],
      pending_outgoing: any[]
  }>();
  public static sharedTripMembersMap = new Map<number, TripMember[]>();
  private swEnabled = false;

  static resetSharedState() {
    MockMapsManager.sharedMockTrips = null;
    MockMapsManager.sharedMockVisits = null;
    MockMapsManager.sharedMockActivityFeed = null;
    MockMapsManager.sharedMockSocial = null;
    MockMapsManager.sharedMockSocialMap.clear();
    MockMapsManager.sharedTripMembersMap.clear();
  }

  constructor(private page: Page) {}

  enableServiceWorker() {
    this.swEnabled = true;
  }

  async failMarkers() {
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
        }
        if ((window as any).useWineryDataStore) {
            (window as any).useWineryDataStore.setState({ persistentWineries: [], error: null });
        }
    }).catch(() => {});

    await this.page.route(/\/rpc\/get_map_markers/, async (route) => {
      console.log(`[DIAGNOSTIC] Intercepting get_map_markers with 500 error`);
      await route.fulfill({ status: 500, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ message: 'Internal Server Error' }) });
    });
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

    const markers: MapMarkerRpc[] = [
        createMockMapMarkerRpc({ id: 1 as WineryDbId, google_place_id: 'ch-12345-mock-winery-1' as GooglePlaceId, name: 'Mock Winery One' }),
        createMockMapMarkerRpc({ id: 2 as WineryDbId, google_place_id: 'ch-67890-mock-winery-2' as GooglePlaceId, name: 'Vineyard of Illusion' }),
        createMockMapMarkerRpc({ id: 3 as WineryDbId, google_place_id: 'ch-abcde-mock-winery-3' as GooglePlaceId, name: 'The Phantom Cellar' })
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
                console.log(`[DIAGNOSTIC] Intercepting Profiles REST: ${url}`);
                const headers = req.headers();
                const isSingle = headers['accept']?.includes('application/vnd.pgrst.object+json');
                const profile = { id: currentUserId, name: 'Test User', email: 'test@example.com', privacy_level: 'public' };
                const body = isSingle ? JSON.stringify(profile) : JSON.stringify([profile]);
                return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body });
            }
            if (url.includes('/rpc/')) {
                console.log(`[DIAGNOSTIC] Seen RPC: ${url}`);

                // 1. Fallback if real data is requested for this category
                // For Social: We fallback for ALL operations if realSocialEnabled is true.
                const isSocialRpc = /rpc\/(send_friend_request|respond_to_friend_request|get_friends_and_requests|remove_friend|get_friend_activity_feed|get_friend_profile_with_visits|is_visible_to_viewer|update_profile_privacy|get_friends_ratings_for_winery|get_friends_activity_for_winery|send_follow_request|respond_to_follow_request)/.test(url);
                if (this.realSocialEnabled && isSocialRpc) {
                    console.log(`[DIAGNOSTIC] Falling back for Social RPC: ${url}`);
                    return route.fallback();
                }

                if (this.realFavoritesEnabled && /rpc\/(toggle_favorite|toggle_wishlist|toggle_favorite_privacy|toggle_wishlist_privacy|ensure_winery)/.test(url)) {
                    return route.fallback();
                }

                if (this.realVisitsEnabled && /rpc\/(ensure_winery|log_visit|update_visit|delete_visit|get_paginated_visits)/.test(url)) {
                    console.log(`[DIAGNOSTIC] Falling back for Visit RPC: ${url}`);
                    return route.fallback();
                }

                if (this.realTripsEnabled && /rpc\/(get_trip_details|get_trips_for_date|create_trip|delete_trip|reorder_trip_wineries|update_trip_winery_notes|add_trip_member_by_email|add_winery_to_trip|remove_winery_from_trip|add_winery_to_trips)/.test(url)) {
                    console.log(`[DIAGNOSTIC] Falling back for Trip RPC: ${url}`);
                    return route.fallback();
                }

                // 2. Mocks for specific RPCs
                if (url.includes('log_visit')) {
                    const postData = JSON.parse(req.postData() || '{}');
                    const newId = 1000 + Math.floor(Math.random() * 9000);
                    const wineryData = postData.p_winery_data || {};
                    const visitData = postData.p_visit_data || {};
                    const wineryId = wineryData.id;
                    const winery = markers.find(m => m.id === wineryId || m.google_place_id === wineryId);
                    
                    if (!MockMapsManager.sharedMockVisits) MockMapsManager.sharedMockVisits = [];
                    
                    const newVisit = {
                        visit_id: newId,
                        user_id: currentUserId,
                        visit_date: visitData.visit_date || todayCA,
                        user_review: visitData.user_review || null,
                        rating: visitData.rating || null,
                        photos: visitData.photos || [],
                        winery_id: winery?.id || 123,
                        winery_name: winery?.name || wineryData.name || 'Unknown Winery',
                        google_place_id: winery?.google_place_id || wineryId,
                        winery_address: winery?.address || wineryData.address || 'Unknown Address',
                        friend_visits: []
                    };
                    MockMapsManager.sharedMockVisits.push(newVisit);

                    // Update shared feed
                    if (!MockMapsManager.sharedMockActivityFeed) MockMapsManager.sharedMockActivityFeed = [];
                    MockMapsManager.sharedMockActivityFeed.push({
                        activity_type: 'visit',
                        created_at: new Date().toISOString(),
                        activity_user_id: currentUserId,
                        user_name: 'Test User',
                        user_email: 'test@example.com',
                        winery_id: newVisit.winery_id,
                        winery_name: newVisit.winery_name,
                        visit_rating: newVisit.rating,
                        visit_review: newVisit.user_review,
                        visit_photos: newVisit.photos
                    });

                    return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ visit_id: newId, winery_id: wineryId }) });
                }

                if (url.includes('toggle_favorite_privacy') || url.includes('toggle_wishlist_privacy')) {
                    return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
                }

                if (url.includes('create_trip_with_winery')) {
                    const postData = JSON.parse(req.postData() || '{}');
                    const newId = Math.floor(Math.random() * 10000);
                    const newTrip = createMockTrip({
                        id: newId,
                        name: postData.p_trip_name,
                        trip_date: postData.p_trip_date,
                        user_id: currentUserId
                    });
                    if (!MockMapsManager.sharedMockTrips) MockMapsManager.sharedMockTrips = [];
                    MockMapsManager.sharedMockTrips.push(newTrip);
                    return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ trip_id: newId }) });
                }

                if (url.includes('create_trip')) {
                    const postData = JSON.parse(req.postData() || '{}');
                    const newId = Math.floor(Math.random() * 10000);
                    const newTrip = createMockTrip({
                        id: newId,
                        name: postData.p_name,
                        trip_date: postData.p_trip_date,
                        user_id: currentUserId
                    });
                    if (!MockMapsManager.sharedMockTrips) MockMapsManager.sharedMockTrips = [];
                    MockMapsManager.sharedMockTrips.push(newTrip);
                    return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ id: newId }) });
                }

                if (url.includes('delete_trip')) {
                    const postData = JSON.parse(req.postData() || '{}');
                    const tripId = postData.p_trip_id;
                    if (MockMapsManager.sharedMockTrips) {
                        MockMapsManager.sharedMockTrips = MockMapsManager.sharedMockTrips.filter(t => t.id !== tripId);
                    }
                    return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
                }

                if (url.includes('delete_visit')) {
                    const postData = JSON.parse(req.postData() || '{}');
                    const visitId = Number(postData.p_visit_id);
                    if (MockMapsManager.sharedMockVisits) {
                        MockMapsManager.sharedMockVisits = MockMapsManager.sharedMockVisits.filter(v => Number(v.visit_id) !== visitId);
                    }
                    return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
                }

                if (url.includes('get_map_markers') || url.includes('get_wineries_in_bounds') || url.includes('get_paginated_wineries')) {
                    console.log(`[DIAGNOSTIC] Fulfilling Map RPC: ${url}`);
                    return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(markers) });
                }
                if (url.includes('ensure_winery')) {
                    return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(999123) });
                }
                if (url.includes('send_friend_request')) {
                    const postData = JSON.parse(req.postData() || '{}');
                    const targetEmail = postData.p_friend_email;
                    console.log(`[DIAGNOSTIC] Intercepted send_friend_request to ${targetEmail}`);
                    
                    if (!MockMapsManager.sharedMockSocial) {
                        MockMapsManager.sharedMockSocial = { friends: [], pending_incoming: [], pending_outgoing: [] };
                    }
                    
                    // Add to outgoing for current context
                    MockMapsManager.sharedMockSocial.pending_outgoing.push({
                        id: 'mock-target-id',
                        name: targetEmail.split('@')[0],
                        email: targetEmail
                    });

                    // Add to incoming for target context (simulated)
                    MockMapsManager.sharedMockSocial.pending_incoming.push({
                        id: currentUserId,
                        name: 'Test User',
                        email: 'test@example.com' // Simplification
                    });
                    
                    return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
                }
                
                if (url.includes('respond_to_friend_request')) {
                    const postData = JSON.parse(req.postData() || '{}');
                    const requesterId = postData.p_requester_id;
                    const action = postData.p_action;
                    
                    if (MockMapsManager.sharedMockSocial && action === 'accepted') {
                        const request = MockMapsManager.sharedMockSocial.pending_incoming.find(r => r.id === requesterId);
                        if (request) {
                            MockMapsManager.sharedMockSocial.friends.push(request);
                            MockMapsManager.sharedMockSocial.pending_incoming = MockMapsManager.sharedMockSocial.pending_incoming.filter(r => r.id !== requesterId);
                            // Also clear from outgoing (simulated)
                            MockMapsManager.sharedMockSocial.pending_outgoing = MockMapsManager.sharedMockSocial.pending_outgoing.filter(r => r.id !== 'mock-target-id');
                        }
                    }
                    
                    return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
                }

                if (url.includes('get_friends_and_requests')) {
                    if (this.realSocialEnabled) {
                        console.log(`[DIAGNOSTIC] Falling back for Friends RPC: ${url}`);
                        return route.fallback();
                    }
                    const userSocial = MockMapsManager.sharedMockSocialMap.get(currentUserId) 
                                    || MockMapsManager.sharedMockSocial 
                                    || { friends: [], pending_incoming: [], pending_outgoing: [] };
                    return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(userSocial) });
                }
                if (url.includes('get_friend_activity_feed')) {
                    if (this.realSocialEnabled) {
                        console.log(`[DIAGNOSTIC] Falling back for Feed RPC: ${url}`);
                        return route.fallback();
                    }
                    const feed = MockMapsManager.sharedMockActivityFeed || [];
                    return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(feed) });
                }
                if (url.includes('add_trip_member_by_email')) {
                    const postData = JSON.parse(req.postData() || '{}');
                    const tripId = postData.p_trip_id;
                    const email = postData.p_email;
                    
                    // Update the trip in shared state if it exists
                    if (MockMapsManager.sharedMockTrips) {
                        const trip = MockMapsManager.sharedMockTrips.find(t => t.id === Number(tripId));
                        if (trip && trip.members) {
                            trip.members.push({
                                id: 'mock-invited-id',
                                email: email,
                                name: email.split('@')[0],
                                role: 'member',
                                status: 'invited'
                            });
                        }
                    }
                    
                    return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
                }
                if (url.includes('get_trip_details')) {
                    console.log(`[DIAGNOSTIC] Fulfilling Mock get_trip_details: ${url}`);
                    const postData = JSON.parse(req.postData() || '{}');
                    const requestedId = postData.trip_id_param;
                    const trips = MockMapsManager.sharedMockTrips || [];
                    const found = trips.find(t => t.id === Number(requestedId));
                    return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(found || trips[0] || {}) });
                }
                if (url.includes('get_paginated_visits')) {
                    if (this.realVisitsEnabled) return route.fallback();
                    const visits = [...(MockMapsManager.sharedMockVisits || [])].sort((a, b) => 
                        new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime()
                    );
                    return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(visits) });
                }
                return route.fallback();
            }
            if (url.includes('/auth/v1/')) return route.fallback();
            if (url.includes('/rest/v1/trips')) {
                if (this.realTripsEnabled) return route.fallback();
                
                if (method === 'PATCH') {
                    const postData = JSON.parse(req.postData() || '{}');
                    console.log(`[DIAGNOSTIC] Intercepting Trips PATCH: ${url}`, postData);
                    
                    // Extract ID from URL (e.g., ...trips?id=eq.999)
                    const idMatch = url.match(/id=eq\.(\d+)/);
                    if (idMatch && MockMapsManager.sharedMockTrips) {
                        const tripId = parseInt(idMatch[1], 10);
                        const trip = MockMapsManager.sharedMockTrips.find(t => t.id === tripId);
                        if (trip) {
                            Object.assign(trip, postData);
                            console.log(`[DIAGNOSTIC] Updated sharedMockTrip ${tripId} with:`, postData);
                        }
                    }
                    return route.fulfill({ status: 204, headers: commonHeaders });
                }

                const trips = MockMapsManager.sharedMockTrips || [];
                console.log(`[DIAGNOSTIC] Intercepting Trips GET: ${url}. Returning ${trips.length} trips.`);
                
                // Transform to match TripService.getTrips select structure if needed
                // TripService expects: trip_wineries (count), trip_members!inner (user_id)
                const transformed = trips.map(t => ({
                    ...t,
                    trip_wineries: [{ count: t.wineries?.length || 0 }],
                    trip_members: (t.members || []).map(m => ({ user_id: m.id }))
                }));

                return route.fulfill({ 
                    status: 200, 
                    contentType: 'application/json', 
                    body: JSON.stringify(transformed), 
                    headers: { ...commonHeaders, 'x-total-count': transformed.length.toString() } 
                });
            }
            if (url.includes('/rest/v1/favorites')) {
                if (this.realFavoritesEnabled) return route.fallback();
                console.log(`[DIAGNOSTIC] Intercepting Favorites REST: ${url}`);
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

    if (!MockMapsManager.sharedMockVisits) {
        const mockVisit = createMockVisitWithWinery({ 
            wineryId: 'ch-67890-mock-winery-2' as GooglePlaceId, 
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
            createMockTrip({ 
                id: 999, 
                name: 'Collaboration Trip', 
                trip_date: todayCA, 
                user_id: currentUserId,
                members: [
                    { id: currentUserId, role: 'owner', status: 'joined', name: 'Test User', email: 'test@example.com' },
                    { id: 'user-b-id', role: 'member', status: 'joined', name: 'User B', email: 'user-b@example.com' }
                ]
            }) 
        ];
    }

    // Proactive injection into Store
    await this.page.addInitScript(({ mockMarkers, swEnabled, realFavoritesEnabled, realVisitsEnabled, realTripsEnabled }: any) => {
        (window as any)._E2E_MOCKS_ACTIVE = true;
        
        // Enable real sync in store if we're using real favorites/visits/trips
        if (realFavoritesEnabled || realVisitsEnabled || realTripsEnabled) {
            (window as any)._E2E_ENABLE_REAL_SYNC = true;
        }

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
    }, { 
        mockMarkers: markers, 
        swEnabled: this.swEnabled,
        realFavoritesEnabled: this.realFavoritesEnabled,
        realVisitsEnabled: this.realVisitsEnabled,
        realTripsEnabled: this.realTripsEnabled
    } as any);
  }

  // --- ERROR INJECTION METHODS (Restored for error-handling.spec.ts) ---
  // async failMarkers() { // REMOVED - now handled by _shouldFailMarkers flag
  //   await this.page.route(/\/rpc\/get_map_markers/, async (route) => {
  //     await route.fulfill({ status: 500, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ message: 'Internal Server Error' }) });
  //   });
  // }

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
                                         text.includes('navigation preload') ||
                                         text.includes('InvalidStateError') ||
                                         text.includes('JSHandle@object') ||
                                         text.includes('WebKit encountered an internal error');

            const isThirdPartyNoise = text.includes('Cookie “__cf_bm” has been rejected') ||
                                     text.includes('Google Maps JavaScript API: Unable to fetch configuration');
            
            if (!isInfrastructure && !isExpectedOfflineError && !isThirdPartyNoise) {
                console.error(`FAILING TEST DUE TO CONSOLE ERROR: ${text}`);
                throw new Error(`Fatal Error: ${text}`);
            }
        }
    };

    page.on('console', logHandler);
    
    // Add Request Logging for RPCs
    page.on('request', request => {
        const url = request.url();
        if (url.includes('rpc/')) {
            console.log(`[DIAGNOSTIC] [NETWORK-REQ] ${request.method()} ${url}`);
        }
    });
    // page.context().on('console', logHandler); // REMOVED: Duplicate context-level listener causes double logs

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
export { createMockTrip, createMockVisitWithWinery, createMockMapMarkerRpc } from '@/lib/test-utils/fixtures';

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
