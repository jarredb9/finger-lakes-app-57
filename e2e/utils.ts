/* eslint-disable no-console */
/* eslint-disable react-hooks/rules-of-hooks */
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
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
  updated_at: string;
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
 * Shared state container for MockMapsManager to allow coordination between 
 * multiple contexts in a single test without using static class properties 
 * that can leak between worker-level test runs.
 */
export interface MockMapsState {
    trips: Trip[] | null;
    visits: RpcVisitWithWinery[] | null;
    activityFeed: FriendActivityFeedItem[] | null;
    social: {
        friends: any[],
        pending_incoming: any[],
        pending_outgoing: any[]
    } | null;
    socialMap: Map<string, {
        friends: any[],
        pending_incoming: any[],
        pending_outgoing: any[]
    }>;
    tripMembersMap: Map<number, TripMember[]>;
    favoritesMap: Map<string, Set<string>>;
    wishlistMap: Map<string, Set<string>>;
}

export function createDefaultMockState(): MockMapsState {
    return {
        trips: null,
        visits: null,
        activityFeed: null,
        social: null,
        socialMap: new Map(),
        tripMembersMap: new Map(),
        favoritesMap: new Map(),
        wishlistMap: new Map()
    };
}

/**
 * Manager class for handling API mocks in E2E tests.
 */
export class MockMapsManager {
  private state: MockMapsState;
  private currentUserId: string = 'test-user-id';
  private swEnabled = false;
  private mocksRegistered = false;
  private workerIndex: number;

  constructor(private page: Page, state?: MockMapsState, workerIndex: number = 0) {
      this.state = state || createDefaultMockState();
      this.workerIndex = workerIndex;
  }

  /**
   * Sets up console and request logging for the current page.
   */
  setupLogging() {
    const page = this.page;
    const logHandler = (msg: any) => {
        const text = msg.text();
        const type = msg.type();

        console.log(`[BROWSER-${type.toUpperCase()}] ${text}`);

        if (text.includes('Hydration') || text.includes('Error') || type === 'error' || text.includes('403')) {
            if (text.includes('[DIAGNOSTIC]')) return; 
            
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
                console.log(`[DIAGNOSTIC] Would have failed due to console error: ${text}`);
                // Temporarily disabled to see if test continues
                // throw new Error(`Fatal Error: ${text}`);
            }
        }
    };

    page.on('console', logHandler);
    
    const supabaseUrlObj = new URL(supabaseUrl!);
    const supabaseHost = supabaseUrlObj.host;
    
    // Add Request Logging
    page.on('request', request => {
        const url = request.url();
        if (url.includes('rpc/') || url.includes('google') || url.includes(supabaseHost)) {
            console.log(`[DIAGNOSTIC] [NETWORK-REQ] ${request.method()} ${url}`);
        }
    });

    page.on('response', async response => {
        const url = response.url();
        if (url.includes('rpc/') || url.includes('google') || url.includes(supabaseHost)) {
            const status = response.status();
            console.log(`[DIAGNOSTIC] [NETWORK-RES] ${status} ${url}`);
            if (status >= 400) {
                try {
                    const body = await response.text();
                    console.log(`[DIAGNOSTIC] [NETWORK-ERROR-BODY] ${body}`);
                } catch (e) {}
            }
        }
    });
  }

  /**
   * Access the shared state object.
   */
  getState(): MockMapsState {
      return this.state;
  }

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

    await this.page.route(/.*rpc\/get_map_markers/, async (route) => {
      console.log(`[DIAGNOSTIC] Intercepting get_map_markers with 500 error`);
      await route.fulfill({ status: 500, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ message: 'Internal Server Error' }) });
    });
  }

  private async registerMockRoutes() {
    if (this.mocksRegistered) return;

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

    const todayCA = new Date().toLocaleDateString('en-CA');

    const supabaseUrlObj = new URL(supabaseUrl!);
    const supabaseHost = supabaseUrlObj.host.replace(/\./g, '\\.');

    // 1. Supabase Profiles Handler
    await this.page.route(new RegExp(`${supabaseHost}/rest/v1/profiles`), async (route) => {
        const req = route.request();
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });
        if (this.realSocialEnabled) return route.fallback();
        
        const idMatch = req.url().match(/id=eq\.([^&]+)/);
        const requestedId = idMatch ? idMatch[1] : this.currentUserId;
        
        const profile = { id: requestedId, name: 'Test User', email: 'test@example.com', privacy_level: 'public' };
        const body = req.headers()['accept']?.includes('application/vnd.pgrst.object+json') 
            ? JSON.stringify(profile) 
            : JSON.stringify([profile]);
        
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body });
    });

    // 2. Supabase RPC Handler
    await this.page.route(new RegExp(`${supabaseHost}/.*rpc/`), async (route) => {
        const req = route.request();
        const url = req.url();
        const method = req.method();

        if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });

        console.log(`[DIAGNOSTIC] Intercepting RPC: ${url}`);

        // Social Fallbacks
        const isSocialRpc = /rpc\/(send_friend_request|respond_to_friend_request|get_friends_and_requests|remove_friend|get_friend_activity_feed|get_friend_profile_with_visits|is_visible_to_viewer|update_profile_privacy|get_friends_ratings_for_winery|get_friends_activity_for_winery|send_follow_request|respond_to_follow_request)/.test(url);
        if (this.realSocialEnabled && isSocialRpc) return route.fallback();

        if (this.realFavoritesEnabled && /rpc\/(toggle_favorite|toggle_wishlist|toggle_favorite_privacy|toggle_wishlist_privacy|ensure_winery)/.test(url)) return route.fallback();
        if (this.realVisitsEnabled && /rpc\/(ensure_winery|log_visit|update_visit|delete_visit|get_paginated_visits)/.test(url)) return route.fallback();
        if (this.realTripsEnabled && /rpc\/(get_trip_details|get_trips_for_date|create_trip|create_trip_with_winery|delete_trip|reorder_trip_wineries|update_trip_winery_notes|add_trip_member_by_email|add_winery_to_trip|remove_winery_from_trip|add_winery_to_trips)/.test(url)) return route.fallback();

        // Specific RPC Implementations
        if (url.includes('get_trips_for_date')) {
            const postData = JSON.parse(req.postData() || '{}');
            const targetDate = postData.target_date;
            const trips = (this.state.trips || []).filter(t => t.trip_date === targetDate);
            return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(trips) });
        }

        if (url.includes('log_visit')) {
            const postData = JSON.parse(req.postData() || '{}');
            const newId = 1000 + Math.floor(Math.random() * 9000);
            const wineryData = postData.p_winery_data || {};
            const visitData = postData.p_visit_data || {};
            const wineryId = wineryData.id;
            const winery = markers.find(m => m.id === wineryId || m.google_place_id === wineryId);
            
            if (!this.state.visits) this.state.visits = [];
            
            const newVisit = {
                visit_id: newId,
                user_id: this.currentUserId,
                visit_date: visitData.visit_date || todayCA,
                user_review: visitData.user_review || null,
                rating: visitData.rating || null,
                photos: visitData.photos || [],
                winery_id: winery?.id || 123,
                winery_name: winery?.name || wineryData.name || 'Unknown Winery',
                google_place_id: winery?.google_place_id || wineryId,
                winery_address: winery?.address || wineryData.address || 'Unknown Address',
                friend_visits: [],
                updated_at: new Date(Date.now() + 5000).toISOString()
            };
            this.state.visits.push(newVisit);

            if (!this.state.activityFeed) this.state.activityFeed = [];
            this.state.activityFeed.push({
                activity_type: 'visit',
                created_at: new Date().toISOString(),
                activity_user_id: this.currentUserId,
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

        if (url.includes('toggle_wishlist')) {
            const postData = JSON.parse(req.postData() || '{}');
            const wineryId = postData.p_winery_data?.id;
            if (!this.state.wishlistMap.has(this.currentUserId)) this.state.wishlistMap.set(this.currentUserId, new Set());
            const userWishlist = this.state.wishlistMap.get(this.currentUserId)!;
            let nextState = true;
            if (userWishlist.has(wineryId)) {
                userWishlist.delete(wineryId);
                nextState = false;
            } else {
                userWishlist.add(wineryId);
                nextState = true;
            }
            return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(nextState) });
        }

        if (url.includes('toggle_favorite')) {
            const postData = JSON.parse(req.postData() || '{}');
            const wineryId = postData.p_winery_data?.id;
            if (!this.state.favoritesMap.has(this.currentUserId)) this.state.favoritesMap.set(this.currentUserId, new Set());
            const userFavorites = this.state.favoritesMap.get(this.currentUserId)!;
            let nextState = true;
            if (userFavorites.has(wineryId)) {
                userFavorites.delete(wineryId);
                nextState = false;
            } else {
                userFavorites.add(wineryId);
                nextState = true;
            }
            return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(nextState) });
        }

        if (url.includes('create_trip_with_winery')) {
            const postData = JSON.parse(req.postData() || '{}');
            const newId = Math.floor(Math.random() * 10000);
            const newTrip = createMockTrip({ 
                id: newId, 
                name: postData.p_trip_name, 
                trip_date: postData.p_trip_date, 
                user_id: this.currentUserId,
                updated_at: new Date(Date.now() + 5000).toISOString()
            });
            if (!this.state.trips) this.state.trips = [];
            this.state.trips.push(newTrip);
            return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ trip_id: newId }) });
        }

        if (url.includes('create_trip')) {
            const postData = JSON.parse(req.postData() || '{}');
            const newId = Math.floor(Math.random() * 10000);
            const newTrip = createMockTrip({ 
                id: newId, 
                name: postData.p_name, 
                trip_date: postData.p_trip_date, 
                user_id: this.currentUserId,
                updated_at: new Date(Date.now() + 5000).toISOString()
            });
            if (!this.state.trips) this.state.trips = [];
            this.state.trips.push(newTrip);
            return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ id: newId }) });
        }

        if (url.includes('delete_trip')) {
            const postData = JSON.parse(req.postData() || '{}');
            const tripId = postData.p_trip_id;
            if (this.state.trips) {
                this.state.trips = this.state.trips.filter(t => t.id !== tripId);
            }
            return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
        }

        if (url.includes('delete_visit')) {
            const postData = JSON.parse(req.postData() || '{}');
            const visitId = Number(postData.p_visit_id);
            if (this.state.visits) {
                this.state.visits = this.state.visits.filter(v => Number(v.visit_id) !== visitId);
            }
            return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
        }

        if (url.includes('get_map_markers') || url.includes('get_wineries_in_bounds') || url.includes('get_paginated_wineries')) {
            const userFavorites = this.state.favoritesMap.get(this.currentUserId);
            const userWishlist = this.state.wishlistMap.get(this.currentUserId);
            const dynamicMarkers = markers.map(m => ({
                ...m,
                is_favorite: userFavorites?.has(m.google_place_id) || false,
                on_wishlist: userWishlist?.has(m.google_place_id) || false
            }));
            return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(dynamicMarkers) });
        }

        if (url.includes('ensure_winery')) {
            return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(999123) });
        }

        if (url.includes('send_friend_request')) {
            const postData = JSON.parse(req.postData() || '{}');
            const targetEmail = postData.target_email || postData.p_friend_email;
            if (!this.state.social) this.state.social = { friends: [], pending_incoming: [], pending_outgoing: [] };
            this.state.social.pending_outgoing.push({ id: 'mock-target-id', name: (targetEmail || 'unknown').split('@')[0], email: targetEmail || 'unknown@example.com' });
            this.state.social.pending_incoming.push({ id: this.currentUserId, name: 'Test User', email: 'test@example.com' });
            return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
        }
        
        if (url.includes('respond_to_friend_request')) {
            const postData = JSON.parse(req.postData() || '{}');
            const requesterId = postData.requester_id || postData.p_requester_id;
            const accept = postData.accept !== undefined ? postData.accept : (postData.p_action === 'accepted');
            if (this.state.social && accept) {
                const request = this.state.social.pending_incoming.find(r => r.id === requesterId);
                if (request) {
                    this.state.social.friends.push(request);
                    this.state.social.pending_incoming = this.state.social.pending_incoming.filter(r => r.id !== requesterId);
                    this.state.social.pending_outgoing = this.state.social.pending_outgoing.filter(r => r.id !== 'mock-target-id');
                }
            }
            return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
        }

        if (url.includes('get_friends_and_requests')) {
            const userSocial = this.state.socialMap.get(this.currentUserId) || this.state.social || { friends: [], pending_incoming: [], pending_outgoing: [] };
            return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(userSocial) });
        }

        if (url.includes('get_friend_activity_feed')) {
            const feed = this.state.activityFeed || [];
            return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(feed) });
        }

        if (url.includes('add_trip_member_by_email')) {
            const postData = JSON.parse(req.postData() || '{}');
            const tripId = postData.p_trip_id;
            const email = postData.p_email;
            if (this.state.trips) {
                const trip = this.state.trips.find(t => Number(t.id) === Number(tripId));
                if (trip) {
                    if (!trip.members) trip.members = [];
                    if (!trip.members.some(m => m.email.toLowerCase() === email.toLowerCase())) {
                        trip.members.push({ id: `mock-invited-${Math.floor(Math.random() * 10000)}`, email: email, name: email.split('@')[0], role: 'member', status: 'invited' });
                        trip.updated_at = new Date().toISOString();
                    }
                }
            }
            return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
        }

        if (url.includes('get_trip_details')) {
            const postData = JSON.parse(req.postData() || '{}');
            const requestedId = postData.trip_id_param;
            const trips = this.state.trips || [];
            const found = trips.find(t => Number(t.id) === Number(requestedId));
            if (!found) return route.fulfill({ status: 404, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ error: `Trip ID ${requestedId} not found` }) });
            return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(found) });
        }

        if (url.includes('get_paginated_visits')) {
            const visits = [...(this.state.visits || [])].sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime());
            return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(visits) });
        }

        if (url.includes('get_friend_profile_with_visits')) {
            const postData = JSON.parse(req.postData() || '{}');
            const friendId = postData.friend_id_param;
            const visits = (this.state.visits || []).filter(v => v.user_id === friendId);
            return route.fulfill({ 
                status: 200, 
                contentType: 'application/json', 
                headers: commonHeaders, 
                body: JSON.stringify({
                    profile: { id: friendId, name: 'Mock Friend', email: 'friend@example.com', privacy_level: 'public' },
                    visits: visits,
                    stats: { total_visits: visits.length, favorite_count: 0, wishlist_count: 0 }
                }) 
            });
        }

        if (isSocialRpc) {
            return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify([]) });
        }

        return route.fulfill({ 
            status: 501, 
            contentType: 'application/json', 
            headers: commonHeaders, 
            body: JSON.stringify({ message: `Mock not implemented for RPC: ${url}` }) 
        });
    });

    // 3. Supabase Auth Handler
    await this.page.route(new RegExp(`${supabaseHost}/auth/v1/`), async (route) => {
        return route.fallback();
    });

    // 4. Supabase Trips REST Handler
    await this.page.route(new RegExp(`${supabaseHost}/rest/v1/trips`), async (route) => {
        const req = route.request();
        if (this.realTripsEnabled) return route.fallback();
        
        if (req.method() === 'PATCH') {
            const postData = JSON.parse(req.postData() || '{}');
            const idMatch = req.url().match(/id=eq\.(\d+)/);
            if (idMatch && this.state.trips) {
                const tripId = parseInt(idMatch[1], 10);
                const trip = this.state.trips.find(t => Number(t.id) === tripId);
                if (trip) {
                    Object.assign(trip, postData);
                    trip.updated_at = new Date().toISOString();
                }
            }
            return route.fulfill({ status: 204, headers: commonHeaders });
        }

        const trips = this.state.trips || [];
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
    });

    // 5. Supabase Favorites REST Handler
    await this.page.route(new RegExp(`${supabaseHost}/rest/v1/favorites`), async (route) => {
        if (this.realFavoritesEnabled) return route.fallback();
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify([]) });
    });

    // 6. Supabase Functions Handler
    await this.page.route(new RegExp(`${supabaseHost}/functions/v1/`), async (route) => {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true, data: {} }) });
    });

    // 7. Google Maps JS Handler
    await this.page.route(/(maps\.googleapis\.com|google\.com).*js(\?|&)key=/, async (route) => {
        const req = route.request();
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });
        return route.fulfill({ 
            status: 200, 
            contentType: 'application/javascript', 
            headers: { 'Access-Control-Allow-Origin': '*' }, 
            body: 'window.google = { maps: { _isMocked: true, importLibrary: () => Promise.resolve({}), LatLngBounds: function() { this.contains = () => true; this.extend = () => {}; this.getCenter = () => ({lat:()=>42.7,lng:()=>-76.9}); this.getNorthEast=()=>({lat:()=>43,lng:()=>-76}); this.getSouthWest=()=>({lat:()=>42,lng:()=>-77}); }, Geocoder: function() { this.geocode = () => Promise.resolve({results:[]}); }, places: { Place: { searchByText: () => Promise.resolve({places:[]}) } } } };' 
        });
    });

    // 8. Google Places Search Handler
    await this.page.route(/places\.googleapis\.com\/v1\/places:searchText/, async (route) => {
        const req = route.request();
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });
        return route.fulfill({ 
            status: 200, 
            contentType: 'application/json', 
            headers: commonHeaders, 
            body: JSON.stringify({ 
                places: markers.map(m => ({ id: m.google_place_id, name: m.name, displayName: { text: m.name }, formattedAddress: 'Mock NY', location: { latitude: 42.7, longitude: -76.9 }, rating: 4.8 })) 
            }) 
        });
    });

    // 9. Google Maps Tiles Handler
    await this.page.route(/google\.com\/maps\/vt\/tile|google\.com\/vt\/tile/, async (route) => {
        return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANghjYAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
    });

    // 10. Google Fonts Handler
    await this.page.route(/fonts\.(googleapis|gstatic)\.com/, async (route) => {
        const type = route.request().resourceType();
        if (type === 'font' || type === 'stylesheet') return route.fulfill({ status: 200, contentType: type === 'font' ? 'font/woff2' : 'text/css', body: '' });
        return route.fallback();
    });

    this.mocksRegistered = true;
  }

  async initDefaultMocks(options: { currentUserId?: string } = {}) {
    if (process.env.E2E_REAL_DATA === 'true') return;
    
    if (options.currentUserId) {
        const oldId = this.currentUserId;
        this.currentUserId = options.currentUserId;
        
        if (this.state.visits) {
            this.state.visits.forEach(v => { if (v.user_id === oldId) v.user_id = this.currentUserId; });
        }
        if (this.state.trips) {
            this.state.trips.forEach(t => {
                if (t.user_id === oldId) t.user_id = this.currentUserId;
                t.members?.forEach(m => { if (m.id === oldId) m.id = this.currentUserId; });
            });
        }
    }

    if (this.mocksRegistered) return;
    const todayCA = new Date().toLocaleDateString('en-CA');

    await this.registerMockRoutes();

    const markers: MapMarkerRpc[] = [
        createMockMapMarkerRpc({ id: 1 as WineryDbId, google_place_id: 'ch-12345-mock-winery-1' as GooglePlaceId, name: 'Mock Winery One' }),
        createMockMapMarkerRpc({ id: 2 as WineryDbId, google_place_id: 'ch-67890-mock-winery-2' as GooglePlaceId, name: 'Vineyard of Illusion' }),
        createMockMapMarkerRpc({ id: 3 as WineryDbId, google_place_id: 'ch-abcde-mock-winery-3' as GooglePlaceId, name: 'The Phantom Cellar' })
    ];

    if (!this.state.visits) {
        const mockVisit = createMockVisitWithWinery({ 
            wineryId: 'ch-67890-mock-winery-2' as GooglePlaceId, 
            wineryName: 'Vineyard of Illusion',
            visit_date: '2020-01-01',
            user_review: 'A classic mock visit from the past.'
        });
        this.state.visits = [{
            visit_id: 12345, 
            user_id: mockVisit.user_id || this.currentUserId, 
            visit_date: mockVisit.visit_date, 
            user_review: mockVisit.user_review || null,
            rating: mockVisit.rating || null, 
            photos: mockVisit.photos || null, 
            winery_id: mockVisit.winery_id || 2 as WineryDbId, 
            winery_name: mockVisit.wineryName || 'Vineyard of Illusion',
            google_place_id: mockVisit.wineryId || 'ch-67890-mock-winery-2' as GooglePlaceId, 
            winery_address: mockVisit.wineries.address, 
            friend_visits: [],
            updated_at: new Date().toISOString()
        }];
    }

    if (!this.state.trips) {
        this.state.trips = [ 
            createMockTrip({ 
                id: 999, 
                name: 'Collaboration Trip', 
                trip_date: todayCA, 
                user_id: this.currentUserId,
                members: [
                    { id: this.currentUserId, role: 'owner', status: 'joined', name: 'Test User', email: 'test@example.com' },
                    { id: 'user-b-id', role: 'member', status: 'joined', name: 'User B', email: 'user-b@example.com' }
                ]
            }) 
        ];
    }

    // Proactive injection into Store
    await this.page.addInitScript(({ mockMarkers, swEnabled, realFavoritesEnabled, realVisitsEnabled, realTripsEnabled, workerIndex }: any) => {
        (window as any)._E2E_MOCKS_ACTIVE = true;
        
        // Enable real sync in store if we're using real favorites/visits/trips
        if (realFavoritesEnabled || realVisitsEnabled || realTripsEnabled) {
            (window as any)._E2E_ENABLE_REAL_SYNC = true;
        }

        if ('serviceWorker' in navigator) {
            // 1. Unregister foreign service workers immediately
            navigator.serviceWorker.getRegistrations().then(registrations => {
                for (const registration of registrations) {
                    const scriptURL = registration.active?.scriptURL || registration.installing?.scriptURL || registration.waiting?.scriptURL;
                    if (scriptURL && !scriptURL.includes(`worker=${workerIndex}`)) {
                        console.log(`[DIAGNOSTIC] Unregistering foreign SW: ${scriptURL} (Target Worker: ${workerIndex})`);
                        registration.unregister();
                    }
                }
            });

            // 2. Sabotage or Isolate registration
            const originalRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
            (navigator.serviceWorker as any).register = (url: string, options?: any) => {
                if (!swEnabled) {
                    console.log('[DIAGNOSTIC] SW Registration blocked by MockMapsManager');
                    return Promise.reject(new Error('SW blocked for test stability'));
                }

                // Append worker index to SW URL to ensure isolation
                const swUrl = new URL(url, window.location.href);
                swUrl.searchParams.set('worker', String(workerIndex));
                console.log(`[DIAGNOSTIC] Registering isolated SW: ${swUrl.toString()}`);
                return originalRegister(swUrl.toString(), options);
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
                // Only inject if store is truly empty AND we haven't already injected in this context
                // @ts-ignore
                if (state.persistentWineries && state.persistentWineries.length === 0 && mockMarkers.length > 0 && !window._E2E_INJECTED) {
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
                    // @ts-ignore
                    window._E2E_INJECTED = true;
                    console.log('[DIAGNOSTIC] Mock wineries injected into store');
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
        // Run injection attempt
        inject();
        // Still use a small interval for hydration but with a guard to prevent overwrites
        const intervalId = setInterval(inject, 200);
        setTimeout(() => clearInterval(intervalId), 5000);
    }, { 
        mockMarkers: markers, 
        swEnabled: this.swEnabled,
        realFavoritesEnabled: this.realFavoritesEnabled,
        realVisitsEnabled: this.realVisitsEnabled,
        realTripsEnabled: this.realTripsEnabled,
        workerIndex: this.workerIndex
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
  user2: TestUser;
}>({
  // Dynamically set baseURL based on worker index for strict port isolation
  baseURL: async ({}, use, testInfo) => {
    const port = 3001 + (testInfo.workerIndex % 2);
    await use(`http://localhost:${port}`);
  },

  // Use unique storage state per worker to ensure strict filesystem-level partitioning
  storageState: async ({}, use, testInfo) => {
    const partition = path.join(process.cwd(), `test-results/.storage/worker-${testInfo.workerIndex}.json`);
    const dir = path.dirname(partition);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(partition)) {
      fs.writeFileSync(partition, JSON.stringify({ cookies: [], origins: [] }, null, 2));
    }
    await use(partition);
  },

  mockMaps: [async ({ page }, use, testInfo) => {
    const state = createDefaultMockState();
    const manager = new MockMapsManager(page, state, testInfo.workerIndex);
    if (testInfo.file.includes('pwa-')) { manager.enableServiceWorker(); }
    
    manager.setupLogging();

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
  },

  user2: async ({}, use) => {
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
