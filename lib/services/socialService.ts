import { createClient } from '@/utils/supabase/client';
import { WineryDbId } from '@/lib/types';
import { getE2EHeaders } from '@/lib/stores/e2e-utils';

export const SocialService = {
  async getFriends() {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('public.get_friends_and_requests', {}, { headers: getE2EHeaders() } as any);
    if (error) throw error;
    
    // Structure: { friends, pending_incoming, pending_outgoing }
    return (data as any).friends || [];
  },

  async getFriendRequests() {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('public.get_friends_and_requests', {}, { headers: getE2EHeaders() } as any);
    if (error) throw error;
    
    return {
      incoming: (data as any).pending_incoming || [],
      outgoing: (data as any).pending_outgoing || []
    };
  },

  async getFriendActivity() {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('public.get_friend_activity_feed', { 
        limit_val: 20
    }, { headers: getE2EHeaders() } as any);
    if (error) throw error;
    return data || [];
  },

  async sendFriendRequest(email: string) {
    const supabase = createClient();
    const { error } = await supabase.rpc('public.send_friend_request', { target_email: email }, { headers: getE2EHeaders() } as any);
    if (error) throw error;
  },

  async respondToFriendRequest(requesterId: string, accept: boolean) {
    const supabase = createClient();
    const { error } = await supabase.rpc('public.respond_to_friend_request', { 
      requester_id: requesterId, 
      accept: accept 
    }, { headers: getE2EHeaders() } as any);
    if (error) throw error;
  },

  async removeFriend(friendId: string) {
    const supabase = createClient();
    const { error } = await supabase.rpc('public.remove_friend', { target_friend_id: friendId }, { headers: getE2EHeaders() } as any);
    if (error) throw error;
  },

  async getFriendProfile(friendId: string) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('public.get_friend_profile_with_visits', { 
      friend_id_param: friendId 
    }, { headers: getE2EHeaders() } as any);
    if (error) throw error;
    return data;
  },

  async getFriendDataForWinery(wineryId: WineryDbId) {
    const supabase = createClient();
    const [ratingsResult, activityResult] = await Promise.all([
      supabase.rpc('public.get_friends_ratings_for_winery', { winery_id_param: wineryId }, { headers: getE2EHeaders() } as any),
      supabase.rpc('public.get_friends_activity_for_winery', { winery_id_param: wineryId }, { headers: getE2EHeaders() } as any)
    ]);

    if (ratingsResult.error) throw ratingsResult.error;
    if (activityResult.error) throw activityResult.error;

    return {
      ratings: ratingsResult.data || [],
      activity: activityResult.data || { favoritedBy: [], wishlistedBy: [] }
    };
  }
};
