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

  getEquivalentWineryIds(rawId: string | number | undefined | null, markersList: MapMarkerRpc[] = []): string[] {
    if (!rawId) return ['ch-12345-mock-winery-1', '1', '999123'];
    const strId = String(rawId);
    
    const marker = markersList.find(m => String(m.id) === strId || m.google_place_id === strId);
    if (marker) {
      return Array.from(new Set([strId, String(marker.id), marker.google_place_id, 'ch-12345-mock-winery-1']));
    }
    
    if (strId === '1' || strId === 'ch-12345-mock-winery-1' || strId === '999123') {
      return ['ch-12345-mock-winery-1', '1', '999123'];
    }
    
    return [strId];
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

      // Specific RPC Implementations
      if (url.includes('definitely_does_not_exist_rpc_12345')) {
        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          headers: commonHeaders,
          body: JSON.stringify({ code: '42883', message: 'function definitely_does_not_exist_rpc_12345() does not exist' })
        });
      }

      if (url.includes('get_trips_for_date')) {
        const postData = JSON.parse(req.postData() || '{}');
        const targetDate = postData.target_date;
        const trips = (this.state.trips || []).filter(t => t.trip_date === targetDate);
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(trips) });
      }

      if (url.includes('log_visit')) {
        const postData = JSON.parse(req.postData() || '{}');
        const wineryData = postData.p_winery_data || {};
        const visitData = postData.p_visit_data || {};
        const idempotencyKey = postData.p_idempotency_key || null;

        if (idempotencyKey && this.state.visits) {
          const existing = this.state.visits.find(v => v.idempotency_key === idempotencyKey);
          if (existing) {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              headers: commonHeaders,
              body: JSON.stringify({ visit_id: existing.visit_id, winery_id: existing.google_place_id })
            });
          }
        }

        const newId = 1000 + Math.floor(Math.random() * 9000);
        const wineryId = wineryData.id;
        const winery = markers.find(m => m.id === wineryId || m.google_place_id === wineryId);
        
        if (!this.state.visits) this.state.visits = [];
        
        const newVisit: any = {
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
          latitude: winery?.latitude || wineryData.latitude || 42.7,
          longitude: winery?.longitude || wineryData.longitude || -76.9,
          friend_visits: [],
          updated_at: new Date(Date.now() + 5000).toISOString(),
          idempotency_key: idempotencyKey,
          is_private: !!visitData.is_private
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
          latitude: newVisit.latitude,
          longitude: newVisit.longitude,
          visit_rating: newVisit.rating,
          visit_review: newVisit.user_review,
          visit_photos: newVisit.photos
        });

        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ visit_id: newId, winery_id: wineryId }) });
      }

      if (url.includes('toggle_favorite_privacy')) {
        const postData = JSON.parse(req.postData() || '{}');
        const wineryId = postData.p_winery_id || 'ch-12345-mock-winery-1';
        const keys = this.getEquivalentWineryIds(wineryId, markers);
        if (!this.state.favoritePrivacyMap.has(this.currentUserId)) this.state.favoritePrivacyMap.set(this.currentUserId, new Set());
        const userFavPriv = this.state.favoritePrivacyMap.get(this.currentUserId)!;
        const isCurrentlyPrivate = keys.some(k => userFavPriv.has(k));
        let isPrivate = !isCurrentlyPrivate;
        if (isCurrentlyPrivate) {
          keys.forEach(k => userFavPriv.delete(k));
        } else {
          keys.forEach(k => userFavPriv.add(k));
        }
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true, is_private: isPrivate }) });
      }

      if (url.includes('toggle_wishlist_privacy')) {
        const postData = JSON.parse(req.postData() || '{}');
        const wineryId = postData.p_winery_id || 'ch-12345-mock-winery-1';
        const keys = this.getEquivalentWineryIds(wineryId, markers);
        if (!this.state.wishlistPrivacyMap.has(this.currentUserId)) this.state.wishlistPrivacyMap.set(this.currentUserId, new Set());
        const userWishPriv = this.state.wishlistPrivacyMap.get(this.currentUserId)!;
        const isCurrentlyPrivate = keys.some(k => userWishPriv.has(k));
        let isPrivate = !isCurrentlyPrivate;
        if (isCurrentlyPrivate) {
          keys.forEach(k => userWishPriv.delete(k));
        } else {
          keys.forEach(k => userWishPriv.add(k));
        }
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true, is_private: isPrivate }) });
      }

      if (url.includes('toggle_wishlist')) {
        const postData = JSON.parse(req.postData() || '{}');
        const wineryId = postData.p_winery_data?.google_place_id || postData.p_winery_data?.id || postData.p_winery_id || 'ch-12345-mock-winery-1';
        const keys = this.getEquivalentWineryIds(wineryId, markers);
        if (!this.state.wishlistMap.has(this.currentUserId)) this.state.wishlistMap.set(this.currentUserId, new Set());
        const userWishlist = this.state.wishlistMap.get(this.currentUserId)!;
        const isCurrentlyWishlist = keys.some(k => userWishlist.has(k));
        let nextState = !isCurrentlyWishlist;
        if (isCurrentlyWishlist) {
          keys.forEach(k => userWishlist.delete(k));
        } else {
          keys.forEach(k => userWishlist.add(k));
        }
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(nextState) });
      }

      if (url.includes('toggle_favorite')) {
        const postData = JSON.parse(req.postData() || '{}');
        const wineryId = postData.p_winery_data?.google_place_id || postData.p_winery_data?.id || postData.p_winery_id || 'ch-12345-mock-winery-1';
        const keys = this.getEquivalentWineryIds(wineryId, markers);
        if (!this.state.favoritesMap.has(this.currentUserId)) this.state.favoritesMap.set(this.currentUserId, new Set());
        const userFavorites = this.state.favoritesMap.get(this.currentUserId)!;
        const isCurrentlyFav = keys.some(k => userFavorites.has(k));
        let nextState = !isCurrentlyFav;
        if (isCurrentlyFav) {
          keys.forEach(k => userFavorites.delete(k));
        } else {
          keys.forEach(k => userFavorites.add(k));
        }
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(nextState) });
      }

      if (url.includes('create_trip_with_winery')) {
        const postData = JSON.parse(req.postData() || '{}');
        const idempotencyKey = postData.p_idempotency_key || null;

        if (idempotencyKey && this.state.trips) {
          const existing = this.state.trips.find(t => (t as any).idempotency_key === idempotencyKey);
          if (existing) {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              headers: commonHeaders,
              body: JSON.stringify({ trip_id: existing.id, winery_id: (existing as any).winery_id || 1 })
            });
          }
        }

        const newId = Math.floor(Math.random() * 10000);
        const wineryData = postData.p_winery_data || {};
        const wineryId = wineryData.id || 1;

        const newTrip = createMockTrip({ 
          id: newId, 
          name: postData.p_trip_name, 
          trip_date: postData.p_trip_date, 
          user_id: this.currentUserId,
          updated_at: new Date(Date.now() + 5000).toISOString()
        });
        (newTrip as any).idempotency_key = idempotencyKey;
        (newTrip as any).winery_id = wineryId;

        if (!this.state.trips) this.state.trips = [];
        this.state.trips.push(newTrip);
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ trip_id: newId, winery_id: wineryId }) });
      }

      if (url.includes('create_trip')) {
        const postData = JSON.parse(req.postData() || '{}');
        const idempotencyKey = postData.p_idempotency_key || null;

        if (idempotencyKey && this.state.trips) {
          const existing = this.state.trips.find(t => (t as any).idempotency_key === idempotencyKey);
          if (existing) {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              headers: commonHeaders,
              body: JSON.stringify({ 
                id: existing.id, 
                user_id: existing.user_id, 
                trip_date: existing.trip_date, 
                name: existing.name 
              })
            });
          }
        }

        const newId = Math.floor(Math.random() * 10000);
        const newTrip = createMockTrip({ 
          id: newId, 
          name: postData.p_name, 
          trip_date: postData.p_trip_date, 
          user_id: this.currentUserId,
          updated_at: new Date(Date.now() + 5000).toISOString()
        });
        (newTrip as any).idempotency_key = idempotencyKey;

        if (!this.state.trips) this.state.trips = [];
        this.state.trips.push(newTrip);
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ id: newId, user_id: this.currentUserId, trip_date: postData.p_trip_date, name: postData.p_name }) });
      }

      if (url.includes('delete_trip')) {
        const postData = JSON.parse(req.postData() || '{}');
        const tripId = Number(postData.p_trip_id);
        if (this.state.trips) {
          this.state.trips = this.state.trips.filter(t => Number(t.id) !== tripId);
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

      if (url.includes('update_visit')) {
        const postData = JSON.parse(req.postData() || '{}');
        const visitId = Number(postData.p_visit_id);
        const visitData = postData.p_visit_data || {};
        const idempotencyKey = postData.p_idempotency_key || null;

        if (idempotencyKey && this.state.visits) {
          const existing = this.state.visits.find(v => v.idempotency_key === idempotencyKey);
          if (existing) {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              headers: commonHeaders,
              body: JSON.stringify(existing)
            });
          }
        }

        let updatedObj = {};
        if (this.state.visits) {
          const visit = this.state.visits.find(v => Number(v.visit_id) === visitId);
          if (visit) {
            visit.user_review = visitData.user_review !== undefined ? visitData.user_review : visit.user_review;
            visit.rating = visitData.rating !== undefined ? visitData.rating : visit.rating;
            visit.photos = visitData.photos !== undefined ? visitData.photos : visit.photos;
            visit.updated_at = new Date().toISOString();
            if (idempotencyKey) {
              visit.idempotency_key = idempotencyKey;
            }
            updatedObj = visit;
          }
        }
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(updatedObj) });
      }

      if (url.includes('get_map_markers') || url.includes('get_wineries_in_bounds') || url.includes('get_paginated_wineries')) {
        const userFavorites = this.state.favoritesMap.get(this.currentUserId);
        const userFavPriv = this.state.favoritePrivacyMap.get(this.currentUserId);
        const userWishlist = this.state.wishlistMap.get(this.currentUserId);
        const userWishPriv = this.state.wishlistPrivacyMap.get(this.currentUserId);
        const dynamicMarkers = markers.map(m => {
          const keys = this.getEquivalentWineryIds(m.google_place_id || m.id, markers);
          return {
            ...m,
            is_favorite: !!(userFavorites && keys.some(k => userFavorites.has(k))),
            is_favorite_private: !!(userFavPriv && keys.some(k => userFavPriv.has(k))),
            on_wishlist: !!(userWishlist && keys.some(k => userWishlist.has(k))),
            on_wishlist_private: !!(userWishPriv && keys.some(k => userWishPriv.has(k))),
          };
        });
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(dynamicMarkers) });
      }

      if (url.includes('ensure_winery')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(999123) });
      }

      if (url.includes('send_friend_request')) {
        const postData = JSON.parse(req.postData() || '{}');
        const targetEmail = postData.target_email || postData.p_friend_email;
        if (!this.state.social) this.state.social = { friends: [], pending_incoming: [], pending_outgoing: [] };
        this.state.social.pending_outgoing.push({ id: 'mock-target-id', name: (targetEmail || 'unknown').split('@')[0], email: targetEmail || 'unknown@example.com', privacy_level: 'public', ai_enabled: false });
        this.state.social.pending_incoming.push({ id: this.currentUserId, name: 'Test User', email: 'test@example.com', privacy_level: 'public', ai_enabled: false });
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
            if (!trip.members.some(m => m.email?.toLowerCase() === email.toLowerCase())) {
              trip.members.push({ 
                id: `mock-member-${Math.floor(Math.random() * 10000)}`, 
                email: email, 
                name: email.split('@')[0], 
                role: 'member', 
                status: 'invited'
              });
              trip.updated_at = new Date().toISOString();
            }
          }
        }
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
      }

      if (url.includes('get_trip_details')) {
        const postData = JSON.parse(req.postData() || '{}');
        const requestedId = postData.p_trip_id;
        const trips = this.state.trips || [];
        const found = trips.find(t => Number(t.id) === Number(requestedId));
        if (!found) return route.fulfill({ status: 404, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ error: `Trip ID ${requestedId} not found` }) });
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(found) });
      }

      if (url.includes('get_paginated_visits') || url.includes('get_paginated_visits_with_winery_and_friends')) {
        const visits = [...(this.state.visits || [])].sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime());
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(visits) });
      }

      if (url.includes('get_friend_profile_with_visits')) {
        const postData = JSON.parse(req.postData() || '{}');
        const friendId = postData.friend_id || postData.p_friend_id;
        const visits = (this.state.visits || []).filter(v => v.user_id === friendId && !(v as any).is_private);

        let favCount = 0;
        const favs = this.state.favoritesMap.get(friendId);
        const favPriv = this.state.favoritePrivacyMap.get(friendId);
        if (favs) {
          favs.forEach(wId => {
            if (!favPriv?.has(wId) && !favPriv?.has('ch-12345-mock-winery-1')) {
              favCount++;
            }
          });
        }

        let wishCount = 0;
        const wishs = this.state.wishlistMap.get(friendId);
        const wishPriv = this.state.wishlistPrivacyMap.get(friendId);
        if (wishs) {
          wishs.forEach(wId => {
            if (!wishPriv?.has(wId) && !wishPriv?.has('ch-12345-mock-winery-1')) {
              wishCount++;
            }
          });
        }

        const profile: any = { id: friendId, name: 'Mock Friend', email: 'friend@example.com', privacy_level: 'public', ai_enabled: false };
        return route.fulfill({ 
          status: 200, 
          contentType: 'application/json', 
          headers: commonHeaders, 
          body: JSON.stringify({
            profile: profile,
            visits: visits,
            stats: { total_visits: visits.length, favorite_count: favCount, wishlist_count: wishCount }
          }) 
        });
      }

      if (url.includes('get_winery_details_by_id')) {
        const postData = JSON.parse(req.postData() || '{}');
        const wineryId = postData.p_winery_id;
        const marker = markers.find(m => m.id === wineryId || m.google_place_id === wineryId) || markers[0];
        const userFavs = this.state.favoritesMap.get(this.currentUserId);
        const userFavPriv = this.state.favoritePrivacyMap.get(this.currentUserId);
        const userWishs = this.state.wishlistMap.get(this.currentUserId);
        const userWishPriv = this.state.wishlistPrivacyMap.get(this.currentUserId);
        const gId = marker?.google_place_id || 'ch-12345-mock-winery-1';
        const keys = this.getEquivalentWineryIds(wineryId || gId, markers);
        const detail = {
          address: marker?.address || '123 Mock St',
          google_place_id: gId,
          google_rating: 4.5,
          id: wineryId || marker?.id || 12345,
          is_favorite: !!(userFavs && keys.some(k => userFavs.has(k))),
          is_favorite_private: !!(userFavPriv && keys.some(k => userFavPriv.has(k))),
          latitude: marker?.latitude || 42.7,
          longitude: marker?.longitude || -76.9,
          lat: marker?.latitude || 42.7,
          lng: marker?.longitude || -76.9,
          name: marker?.name || 'Mock Winery One',
          on_wishlist: !!(userWishs && keys.some(k => userWishs.has(k))),
          on_wishlist_private: !!(userWishPriv && keys.some(k => userWishPriv.has(k))),
          opening_hours: null,
          phone: '555-0123',
          reservable: false,
          reviews: [],
          trip_info: [],
          user_visited: false,
          visits: [],
          website: 'https://example.com'
        };
        return route.fulfill({ 
          status: 200, 
          contentType: 'application/json', 
          headers: commonHeaders, 
          body: JSON.stringify([detail]) 
        });
      }

      if (url.includes('is_visible_to_viewer')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(true) });
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

    // 2. REST Tables Handlers
    await this.page.context().route(new RegExp(`${supabaseHost}/rest/v1/trips`), async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });
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
        trip_members: (t.members || []).map(m => ({ 
          user_id: m.id,
          role: m.role,
          status: m.status,
          profiles: {
            name: m.name,
            email: m.email
          }
        }))
      }));

      return route.fulfill({ 
        status: 200, 
        contentType: 'application/json', 
        body: JSON.stringify(transformed), 
        headers: { ...commonHeaders, 'x-total-count': transformed.length.toString() } 
      });
    });

    await this.page.context().route(new RegExp(`${supabaseHost}/rest/v1/favorites`), async (route) => {
      if (this.realFavoritesEnabled) return route.fallback();
      return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify([]) });
    });
  }
}

export const tripsFixture = async ({ page }: { page: Page }, use: (m: TripsFixtureManager) => Promise<void>) => {
  const manager = new TripsFixtureManager(page);
  await manager.registerMockRoutes();
  await use(manager);
};
