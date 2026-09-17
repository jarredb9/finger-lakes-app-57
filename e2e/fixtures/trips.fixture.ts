/* eslint-disable react-hooks/rules-of-hooks */
import { Page } from '@playwright/test';
import { createMockMapMarkerRpc, createMockVisitWithWinery, createMockTrip } from '@/lib/test-utils/fixtures';
import { MapMarkerRpc, WineryDbId, GooglePlaceId } from '@/lib/types';
import { MockMapsState, createDefaultMockState } from './types';

export class TripsFixtureManager {
  private state: MockMapsState;
  private currentUserId: string = 'test-user-id';

  // Legacy & Bypass Flags
  realSocialEnabled = false;
  realFavoritesEnabled = false;
  realVisitsEnabled = false;
  realTripsEnabled = false;

  constructor(private page: Page, state?: MockMapsState) {
    this.state = state || createDefaultMockState();
  }

  getState(): MockMapsState {
    return this.state;
  }

  setCurrentUserId(id: string) {
    const oldId = this.currentUserId;
    this.currentUserId = id;

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

  async useRealSocial() { this.realSocialEnabled = true; }
  async useRealFavorites() { this.realFavoritesEnabled = true; }
  async useRealVisits() { this.realVisitsEnabled = true; }
  async useRealTrips() { this.realTripsEnabled = true; }

  async failTrips() {
    const commonHeaders = { 
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-total-count, x-skip-sw-interception',
      'Access-Control-Max-Age': '86400'
    };
    await this.page.context().route(/\/rest\/v1\/trips/, async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });
      await route.fulfill({ status: 500, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ message: 'Database Connection Failed' }) });
    });
  }

  initDefaultState() {
    const todayCA = new Date().toLocaleDateString('en-CA');

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
        photos: mockVisit.photos || [],
        winery_id: mockVisit.winery_id || 2 as WineryDbId,
        winery_name: mockVisit.wineryName || 'Vineyard of Illusion',
        google_place_id: mockVisit.wineryId || 'ch-67890-mock-winery-2' as GooglePlaceId, 
        winery_address: mockVisit.wineries.address, 
        latitude: mockVisit.wineries.latitude,
        longitude: mockVisit.wineries.longitude,
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
  }

  async registerMockRoutes(options: { currentUserId?: string } = {}) {
    if (options.currentUserId) {
      this.setCurrentUserId(options.currentUserId);
    }

    this.initDefaultState();

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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
    const supabaseUrlObj = new URL(supabaseUrl);
    const supabaseHost = supabaseUrlObj.host.replace(/\./g, '\\.');

    // 1. Supabase RPC Handler
    await this.page.context().route(new RegExp(`${supabaseHost}/.*rpc/`), async (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();

      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });

      // Social Fallbacks
      const isSocialRpc = /rpc\/(send_friend_request|respond_to_friend_request|get_friends_and_requests|remove_friend|get_friend_activity_feed|get_friend_profile_with_visits|is_visible_to_viewer|update_profile_privacy|get_friends_ratings_for_winery|get_friends_activity_for_winery|send_follow_request|respond_to_follow_request)/.test(url);
      if (this.realSocialEnabled && isSocialRpc) {
        if (url.includes('get_friend_profile_with_visits') && !this.realVisitsEnabled) {
          // Use mock handler for friend profile stats when visits are mocked
        } else {
          return route.fallback();
        }
      }

      if (this.realFavoritesEnabled && /rpc\/(toggle_favorite|toggle_wishlist|toggle_favorite_privacy|toggle_wishlist_privacy|ensure_winery|get_map_markers|get_winery_details_by_id)/.test(url)) return route.fallback();
      if (this.realVisitsEnabled && /rpc\/(ensure_winery|log_visit|update_visit|delete_visit|get_paginated_visits)/.test(url)) return route.fallback();
      if (this.realTripsEnabled && /rpc\/(get_trip_details|get_trips_for_date|create_trip|create_trip_with_winery|delete_trip|reorder_trip_wineries|update_trip_winery_notes|add_trip_member_by_email|add_winery_to_trip|remove_winery_from_trip|add_winery_to_trips)/.test(url)) return route.fallback();

      // Specific RPC Implementations
      if (url.includes('definitely_does_not_exist_rpc_12345')) {
        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          headers: commonHeaders,
          body: JSON.stringify({ code: '42883', message: 'function definitely_does_not_exist_rpc_12345() does not exist' })
        });
      }

      if (url.includes('get_friends_activity_for_winery')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify([]) });
      }

      if (url.includes('get_friends_ratings_for_winery')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify([]) });
      }

      if (url.includes('get_friends_and_requests')) {
        const userSocial = this.state.socialMap.get(this.currentUserId) || this.state.social || { friends: [], pending_incoming: [], pending_outgoing: [] };
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(userSocial) });
      }

      if (url.includes('respond_to_friend_request')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
      }

      if (url.includes('send_friend_request')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
      }

      if (url.includes('remove_friend')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
      }

      if (url.includes('get_friend_profile_with_visits')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: commonHeaders,
          body: JSON.stringify({
            profile: { id: 'friend-id', name: 'Friend User', email: 'friend@example.com', privacy_level: 'public' },
            stats: { total_visits: 5, unique_wineries: 4 },
            recent_visits: []
          })
        });
      }

      if (url.includes('get_friend_activity_feed')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(this.state.activityFeed || []) });
      }

      if (url.includes('update_profile_privacy')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
      }

      if (url.includes('is_visible_to_viewer')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(true) });
      }

      if (url.includes('get_user_privacy_settings') || url.includes('update_user_privacy_settings')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
      }

      if (url.includes('toggle_favorite')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ is_favorite: true }) });
      }

      if (url.includes('toggle_wishlist')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ on_wishlist: true }) });
      }

      if (url.includes('toggle_favorite_privacy') || url.includes('toggle_wishlist_privacy')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
      }

      if (url.includes('get_map_markers') || url.includes('get_wineries_in_bounds')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(markers) });
      }

      if (url.includes('ensure_winery') || url.includes('get_winery_details_by_id')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(markers[0]) });
      }

      if (url.includes('get_paginated_visits_with_winery_and_friends') || url.includes('get_paginated_visits')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(this.state.visits || []) });
      }

      if (url.includes('log_visit') || url.includes('update_visit')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true, visit_id: 12345 }) });
      }

      if (url.includes('delete_visit')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
      }

      if (url.includes('get_trip_details')) {
        const trip = this.state.trips?.[0] || null;
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(trip) });
      }

      if (url.includes('get_trips_for_date')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(this.state.trips || []) });
      }

      if (url.includes('create_trip') || url.includes('create_trip_with_winery')) {
        const newTrip = createMockTrip({ id: 1000, name: 'New Trip', trip_date: todayCA, user_id: this.currentUserId });
        if (this.state.trips) this.state.trips.push(newTrip);
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(newTrip) });
      }

      if (url.includes('delete_trip')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
      }

      if (url.includes('reorder_trip_wineries') || url.includes('update_trip_winery_notes')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
      }

      if (url.includes('add_trip_member_by_email')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
      }

      if (url.includes('add_winery_to_trip') || url.includes('remove_winery_from_trip') || url.includes('add_winery_to_trips')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
      }

      // Default fallback for unmatched RPCs
      return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify([]) });
    });

    // 2. REST Tables Handlers
    await this.page.context().route(new RegExp(`${supabaseHost}/rest/v1/(trips|trip_wineries|trip_members)`), async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });
      if (this.realTripsEnabled) return route.fallback();

      const url = req.url();
      if (url.includes('/rest/v1/trips')) {
        if (req.method() === 'POST') {
          const postData = req.postDataJSON() || {};
          const newTrip = createMockTrip({ id: 1001, name: postData.name || 'Mock Trip', trip_date: postData.trip_date || todayCA, user_id: this.currentUserId });
          return route.fulfill({ status: 201, headers: commonHeaders, body: JSON.stringify(newTrip) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(this.state.trips || []) });
      }

      return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify([]) });
    });
  }
}

export const tripsFixture = async ({ page }: { page: Page }, use: (m: TripsFixtureManager) => Promise<void>) => {
  const manager = new TripsFixtureManager(page);
  await manager.registerMockRoutes();
  await use(manager);
};
