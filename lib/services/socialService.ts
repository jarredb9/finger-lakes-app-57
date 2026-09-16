import { createClient } from '@/utils/supabase/client';
import { WineryDbId, Friend } from '@/lib/types';

export interface FriendsAndRequestsPayload {
  friends?: Friend[];
  pending_incoming?: Friend[];
  pending_outgoing?: Friend[];
}

export const SocialService = {
  async getSocialData(): Promise<{
    friends: Friend[];
    incoming: Friend[];
    outgoing: Friend[];
  }> {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('get_friends_and_requests', {});
    if (error) throw error;
    
    const payload = data as FriendsAndRequestsPayload | null;
    return {
      friends: payload?.friends || [],
      incoming: payload?.pending_incoming || [],
      outgoing: payload?.pending_outgoing || []
    };
  },

  async getFriends() {
    const data = await this.getSocialData();
    return data.friends;
  },

  async getFriendRequests() {
    const data = await this.getSocialData();
    return {
      incoming: data.incoming,
      outgoing: data.outgoing
    };
  },

  async getFriendActivity() {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('get_friend_activity_feed', { 
        p_limit: 20
    });
    if (error) throw error;
    return data || [];
  },

  async sendFriendRequest(email: string) {
    if (!email || typeof email !== 'string' || !email.trim()) {
      throw new Error('Valid target email is required');
    }
    const supabase = createClient();
    const { error } = await supabase.rpc('send_friend_request', { p_target_email: email.trim() });
    if (error) throw error;
  },

  async respondToFriendRequest(requesterId: string, accept: boolean) {
    if (!requesterId || typeof requesterId !== 'string' || !requesterId.trim()) {
      throw new Error('Valid requesterId is required');
    }
    const supabase = createClient();
    const { error } = await supabase.rpc('respond_to_friend_request', { 
      p_requester_id: requesterId.trim(), 
      p_accept: accept 
    });
    if (error) throw error;
  },

  async removeFriend(friendId: string) {
    if (!friendId || typeof friendId !== 'string' || !friendId.trim()) {
      throw new Error('Valid friendId is required');
    }
    const supabase = createClient();
    const { error } = await supabase.rpc('remove_friend', { p_target_friend_id: friendId.trim() });
    if (error) throw error;
  },

  async getFriendProfile(friendId: string) {
    if (!friendId || typeof friendId !== 'string' || !friendId.trim()) {
      throw new Error('Valid friendId is required');
    }
    const supabase = createClient();
    const { data, error } = await supabase.rpc('get_friend_profile_with_visits', { 
      p_friend_id: friendId.trim() 
    });
    if (error) throw error;
    return data;
  },

  async getFriendDataForWinery(wineryId: WineryDbId) {
    const supabase = createClient();
    const [ratingsResult, activityResult] = await Promise.all([
      supabase.rpc('get_friends_ratings_for_winery', { p_winery_id: wineryId }),
      supabase.rpc('get_friends_activity_for_winery', { p_winery_id: wineryId })
    ]);

    if (ratingsResult.error) throw ratingsResult.error;
    if (activityResult.error) throw activityResult.error;

    return {
      ratings: ratingsResult.data || [],
      activity: activityResult.data || { favoritedBy: [], wishlistedBy: [] }
    };
  }
};
