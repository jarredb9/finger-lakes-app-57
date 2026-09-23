 
import { Page } from '@playwright/test';
import { MapMarkerRpc } from '@/lib/types';
import { MockMapsState, createDefaultMockState } from '../types';
import { MOCK_MARKERS, getEquivalentWineryIds } from '../utils/mock-wineries';

export class FavoritesHandler {
  private state: MockMapsState;
  private currentUserId: string = 'test-user-id';
  realFavoritesEnabled = false;
  private markers: MapMarkerRpc[];
  private isRealVisitsEnabled?: () => boolean;

  constructor(
    private page: Page,
    state?: MockMapsState,
    isRealVisitsEnabled?: () => boolean,
    markers: MapMarkerRpc[] = MOCK_MARKERS
  ) {
    this.state = state || createDefaultMockState();
    this.isRealVisitsEnabled = isRealVisitsEnabled;
    this.markers = markers;
  }

  getState(): MockMapsState {
    return this.state;
  }

  setCurrentUserId(id: string) {
    this.currentUserId = id;
  }

  async useRealFavorites() {
    this.realFavoritesEnabled = true;
  }

  async registerRoutes(options: { currentUserId?: string } = {}) {
    if (options.currentUserId) {
      this.setCurrentUserId(options.currentUserId);
    }

    const commonHeaders = {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-total-count, x-skip-sw-interception',
      'Access-Control-Max-Age': '86400',
    };

    const markers = this.markers;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
    let supabaseHost = 'localhost:54321';
    try {
      const supabaseUrlObj = new URL(supabaseUrl);
      supabaseHost = supabaseUrlObj.host.replace(/\./g, '\\.');
    } catch {
      // Fallback
    }

    const favoritesRpcRegex = new RegExp(
      `${supabaseHost}/.*rpc/(toggle_favorite|toggle_wishlist|toggle_favorite_privacy|toggle_wishlist_privacy|ensure_winery|get_map_markers|get_wineries_in_bounds|get_paginated_wineries|get_winery_details_by_id)`
    );

    await this.page.context().route(favoritesRpcRegex, async (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();

      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });

      if (this.realFavoritesEnabled) {
        return route.fallback();
      }

      if (url.includes('ensure_winery') && this.isRealVisitsEnabled?.()) {
        return route.fallback();
      }

      if (url.includes('toggle_favorite_privacy')) {
        const postData = JSON.parse(req.postData() || '{}');
        const wineryId = postData.p_winery_id || 'ch-12345-mock-winery-1';
        const keys = getEquivalentWineryIds(wineryId, markers);
        if (!this.state.favoritePrivacyMap.has(this.currentUserId)) this.state.favoritePrivacyMap.set(this.currentUserId, new Set());
        const userFavPriv = this.state.favoritePrivacyMap.get(this.currentUserId)!;
        const isCurrentlyPrivate = keys.some(k => userFavPriv.has(k));
        const isPrivate = !isCurrentlyPrivate;
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
        const keys = getEquivalentWineryIds(wineryId, markers);
        if (!this.state.wishlistPrivacyMap.has(this.currentUserId)) this.state.wishlistPrivacyMap.set(this.currentUserId, new Set());
        const userWishPriv = this.state.wishlistPrivacyMap.get(this.currentUserId)!;
        const isCurrentlyPrivate = keys.some(k => userWishPriv.has(k));
        const isPrivate = !isCurrentlyPrivate;
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
        const keys = getEquivalentWineryIds(wineryId, markers);
        if (!this.state.wishlistMap.has(this.currentUserId)) this.state.wishlistMap.set(this.currentUserId, new Set());
        const userWishlist = this.state.wishlistMap.get(this.currentUserId)!;
        const isCurrentlyWishlist = keys.some(k => userWishlist.has(k));
        const nextState = !isCurrentlyWishlist;
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
        const keys = getEquivalentWineryIds(wineryId, markers);
        if (!this.state.favoritesMap.has(this.currentUserId)) this.state.favoritesMap.set(this.currentUserId, new Set());
        const userFavorites = this.state.favoritesMap.get(this.currentUserId)!;
        const isCurrentlyFav = keys.some(k => userFavorites.has(k));
        const nextState = !isCurrentlyFav;
        if (isCurrentlyFav) {
          keys.forEach(k => userFavorites.delete(k));
        } else {
          keys.forEach(k => userFavorites.add(k));
        }
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(nextState) });
      }

      if (url.includes('get_map_markers') || url.includes('get_wineries_in_bounds') || url.includes('get_paginated_wineries')) {
        const userFavorites = this.state.favoritesMap.get(this.currentUserId);
        const userFavPriv = this.state.favoritePrivacyMap.get(this.currentUserId);
        const userWishlist = this.state.wishlistMap.get(this.currentUserId);
        const userWishPriv = this.state.wishlistPrivacyMap.get(this.currentUserId);
        const dynamicMarkers = markers.map(m => {
          const keys = getEquivalentWineryIds(m.google_place_id || m.id, markers);
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

      if (url.includes('get_winery_details_by_id')) {
        const postData = JSON.parse(req.postData() || '{}');
        const wineryId = postData.p_winery_id;
        const marker = markers.find(m => m.id === wineryId || m.google_place_id === wineryId) || markers[0];
        const userFavs = this.state.favoritesMap.get(this.currentUserId);
        const userFavPriv = this.state.favoritePrivacyMap.get(this.currentUserId);
        const userWishs = this.state.wishlistMap.get(this.currentUserId);
        const userWishPriv = this.state.wishlistPrivacyMap.get(this.currentUserId);
        const gId = marker?.google_place_id || 'ch-12345-mock-winery-1';
        const keys = getEquivalentWineryIds(wineryId || gId, markers);
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
          website: 'https://example.com',
        };
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: commonHeaders,
          body: JSON.stringify([detail]),
        });
      }

      return route.fulfill({
        status: 501,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify({ message: `Mock not implemented for RPC: ${url}` }),
      });
    });

    // REST Favorites Table Handler
    await this.page.context().route(new RegExp(`${supabaseHost}/rest/v1/favorites`), async (route) => {
      if (this.realFavoritesEnabled) return route.fallback();
      return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify([]) });
    });
  }
}
