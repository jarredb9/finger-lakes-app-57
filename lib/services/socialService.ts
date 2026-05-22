import { createClient } from '@/utils/supabase/client';
import { WineryDbId } from '@/lib/types';

export const SocialService = {
  async getSocialData() {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('get_friends_and_requests', {});
    if (error) throw error;
    
    return {
      friends: (data as any).friends || [],
      incoming: (data as any).pending_incoming || [],
      outgoing: (data as any).pending_outgoing || []
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
        limit_val: 20
    });
    if (error) throw error;
    return data || [];
  },

  async sendFriendRequest(email: string) {
    const supabase = createClient();
    const { error } = await supabase.rpc('send_friend_request', { target_email: email });
    if (error) throw error;
  },

  async respondToFriendRequest(requesterId: string, accept: boolean) {
    const supabase = createClient();
    const { error } = await supabase.rpc('respond_to_friend_request', { 
      requester_id: requesterId, 
      accept: accept 
    });
    if (error) throw error;
  },

  async removeFriend(friendId: string) {
    const supabase = createClient();
    const { error } = await supabase.rpc('remove_friend', { target_friend_id: friendId });
    if (error) throw error;
  },

  async getFriendProfile(friendId: string) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('get_friend_profile_with_visits', { 
      friend_id_param: friendId 
    });
    if (error) throw error;
    return data;
  },

  async getFriendDataForWinery(wineryId: WineryDbId) {
    const supabase = createClient();
    const [ratingsResult, activityResult] = await Promise.all([
      supabase.rpc('get_friends_ratings_for_winery', { winery_id_param: wineryId }),
      supabase.rpc('get_friends_activity_for_winery', { winery_id_param: wineryId })
    ]);

    if (ratingsResult.error) throw ratingsResult.error;
    if (activityResult.error) throw activityResult.error;

    return {
      ratings: ratingsResult.data || [],
      activity: activityResult.data || { favoritedBy: [], wishlistedBy: [] }
    };
  }
};
