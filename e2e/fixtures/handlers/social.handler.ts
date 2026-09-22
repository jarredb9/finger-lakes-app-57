 
import { Page } from '@playwright/test';
import { MockMapsState, createDefaultMockState, Profile } from '../types';

export class SocialHandler {
  private state: MockMapsState;
  private currentUserId: string = 'test-user-id';
  realSocialEnabled = false;
  private isRealVisitsEnabled?: () => boolean;

  constructor(private page: Page, state?: MockMapsState, isRealVisitsEnabled?: () => boolean) {
    this.state = state || createDefaultMockState();
    this.isRealVisitsEnabled = isRealVisitsEnabled;
  }

  getState(): MockMapsState {
    return this.state;
  }

  setCurrentUserId(id: string) {
    this.currentUserId = id;
  }

  async useRealSocial() {
    this.realSocialEnabled = true;
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
    let supabaseHost = 'localhost:54321';
    try {
      const supabaseUrlObj = new URL(supabaseUrl);
      supabaseHost = supabaseUrlObj.host.replace(/\./g, '\\.');
    } catch {
      // Fallback
    }

    const socialRpcRegex = new RegExp(
      `${supabaseHost}/.*rpc/(send_friend_request|respond_to_friend_request|get_friends_and_requests|remove_friend|get_friend_activity_feed|get_friend_profile_with_visits|is_visible_to_viewer|update_profile_privacy|get_friends_ratings_for_winery|get_friends_activity_for_winery|send_follow_request|respond_to_follow_request)`
    );

    await this.page.context().route(socialRpcRegex, async (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();

      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });

      if (this.realSocialEnabled) {
        if (url.includes('get_friend_profile_with_visits') && !this.isRealVisitsEnabled?.()) {
          // Use mock handler for friend profile stats when visits are mocked
        } else {
          return route.fallback();
        }
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

      if (url.includes('get_friend_profile_with_visits')) {
        const postData = JSON.parse(req.postData() || '{}');
        const friendId = postData.friend_id || postData.p_friend_id;
        const visits = (this.state.visits || []).filter(v => v.user_id === friendId && !v.is_private);

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

        const profile: Profile = { id: friendId, name: 'Mock Friend', email: 'friend@example.com', privacy_level: 'public', ai_enabled: false };
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: commonHeaders,
          body: JSON.stringify({
            profile: profile,
            visits: visits,
            stats: { total_visits: visits.length, favorite_count: favCount, wishlist_count: wishCount },
          }),
        });
      }

      if (url.includes('is_visible_to_viewer')) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(true) });
      }

      // Default for any other social RPC (e.g. remove_friend, update_profile_privacy, etc.)
      return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify([]) });
    });
  }
}
