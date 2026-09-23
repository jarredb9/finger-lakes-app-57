import { SocialService } from '../socialService';
import { WineryDbId } from '@/lib/types';

let mockRpc = jest.fn();

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
  })),
}));

describe('SocialService Unit Test Suite (QA-14)', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  describe('getSocialData', () => {
    it('fetches friends and friend requests and normalizes payload structure', async () => {
      const mockPayload = {
        friends: [
          { id: 'friend-1', name: 'Alice', email: 'alice@example.com' },
          { id: 'friend-2', name: 'Bob', email: 'bob@example.com' },
        ],
        pending_incoming: [
          { id: 'req-1', requester_id: 'user-3', email: 'charlie@example.com' },
        ],
        pending_outgoing: [
          { id: 'req-2', target_id: 'user-4', email: 'diana@example.com' },
        ],
      };

      mockRpc.mockResolvedValueOnce({ data: mockPayload, error: null });

      const result = await SocialService.getSocialData();

      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith('get_friends_and_requests', {});
      expect(result).toEqual({
        friends: mockPayload.friends,
        incoming: mockPayload.pending_incoming,
        outgoing: mockPayload.pending_outgoing,
      });
    });

    it('gracefully handles empty or partial RPC response data with fallback arrays', async () => {
      mockRpc.mockResolvedValueOnce({ data: {}, error: null });

      const result = await SocialService.getSocialData();

      expect(result).toEqual({
        friends: [],
        incoming: [],
        outgoing: [],
      });
    });

    it('throws error when get_friends_and_requests RPC fails', async () => {
      const rpcError = new Error('Database connection failed');
      mockRpc.mockResolvedValueOnce({ data: null, error: rpcError });

      await expect(SocialService.getSocialData()).rejects.toThrow('Database connection failed');
      expect(mockRpc).toHaveBeenCalledWith('get_friends_and_requests', {});
    });
  });

  describe('getFriends', () => {
    it('extracts friends list from getSocialData', async () => {
      const mockFriends = [{ id: 'f-1', name: 'Friend One' }];
      mockRpc.mockResolvedValueOnce({
        data: { friends: mockFriends, pending_incoming: [], pending_outgoing: [] },
        error: null,
      });

      const friends = await SocialService.getFriends();

      expect(friends).toEqual(mockFriends);
    });

    it('propagates errors if underlying getSocialData fails', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: new Error('Unauthorized') });

      await expect(SocialService.getFriends()).rejects.toThrow('Unauthorized');
    });
  });

  describe('getFriendRequests', () => {
    it('extracts incoming and outgoing requests from getSocialData', async () => {
      const incoming = [{ id: 'inc-1' }];
      const outgoing = [{ id: 'out-1' }];
      mockRpc.mockResolvedValueOnce({
        data: { friends: [], pending_incoming: incoming, pending_outgoing: outgoing },
        error: null,
      });

      const requests = await SocialService.getFriendRequests();

      expect(requests).toEqual({ incoming, outgoing });
    });

    it('propagates errors if underlying getSocialData fails', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: new Error('Network error') });

      await expect(SocialService.getFriendRequests()).rejects.toThrow('Network error');
    });
  });

  describe('getFriendActivity', () => {
    it('fetches activity feed with default limit of 20', async () => {
      const mockFeed = [
        { id: 'act-1', user_id: 'u-1', action: 'visit', winery_name: 'Dr. Frank' },
        { id: 'act-2', user_id: 'u-2', action: 'favorite', winery_name: 'Ravines' },
      ];

      mockRpc.mockResolvedValueOnce({ data: mockFeed, error: null });

      const activity = await SocialService.getFriendActivity();

      expect(mockRpc).toHaveBeenCalledWith('get_friend_activity_feed', { p_limit: 20 });
      expect(activity).toEqual(mockFeed);
    });

    it('returns empty array fallback when RPC data is null', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: null });

      const activity = await SocialService.getFriendActivity();

      expect(activity).toEqual([]);
    });

    it('throws error when get_friend_activity_feed RPC fails', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: new Error('Feed error') });

      await expect(SocialService.getFriendActivity()).rejects.toThrow('Feed error');
    });
  });

  describe('sendFriendRequest', () => {
    it('invokes send_friend_request RPC with target email', async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true }, error: null });

      await SocialService.sendFriendRequest('sommelier@fingerlakes.com');

      expect(mockRpc).toHaveBeenCalledWith('send_friend_request', {
        p_target_email: 'sommelier@fingerlakes.com',
      });
    });

    it('throws error when send_friend_request RPC fails', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: new Error('User not found') });

      await expect(SocialService.sendFriendRequest('invalid@example.com')).rejects.toThrow('User not found');
    });

    // Invariant / Hardening Guard (Red Phase)
    it('validates email parameter and rejects empty or invalid email strings before issuing RPC', async () => {
      await expect(SocialService.sendFriendRequest('')).rejects.toThrow(/email/i);
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe('respondToFriendRequest', () => {
    it('invokes respond_to_friend_request RPC with accept = true', async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true }, error: null });

      await SocialService.respondToFriendRequest('req-user-123', true);

      expect(mockRpc).toHaveBeenCalledWith('respond_to_friend_request', {
        p_requester_id: 'req-user-123',
        p_accept: true,
      });
    });

    it('invokes respond_to_friend_request RPC with accept = false (decline)', async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true }, error: null });

      await SocialService.respondToFriendRequest('req-user-456', false);

      expect(mockRpc).toHaveBeenCalledWith('respond_to_friend_request', {
        p_requester_id: 'req-user-456',
        p_accept: false,
      });
    });

    it('throws error when respond_to_friend_request RPC fails', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: new Error('Request already answered') });

      await expect(SocialService.respondToFriendRequest('req-123', true)).rejects.toThrow('Request already answered');
    });

    // Invariant / Hardening Guard (Red Phase)
    it('validates requesterId parameter and rejects empty string before issuing RPC', async () => {
      await expect(SocialService.respondToFriendRequest('', true)).rejects.toThrow(/requester/i);
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe('removeFriend', () => {
    it('invokes remove_friend RPC with target friend ID', async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true }, error: null });

      await SocialService.removeFriend('friend-uuid-789');

      expect(mockRpc).toHaveBeenCalledWith('remove_friend', {
        p_target_friend_id: 'friend-uuid-789',
      });
    });

    it('throws error when remove_friend RPC fails', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: new Error('Friend relation not found') });

      await expect(SocialService.removeFriend('friend-999')).rejects.toThrow('Friend relation not found');
    });

    // Invariant / Hardening Guard (Red Phase)
    it('validates friendId parameter and rejects empty string before issuing RPC', async () => {
      await expect(SocialService.removeFriend('')).rejects.toThrow(/friend/i);
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe('getFriendProfile', () => {
    it('invokes get_friend_profile_with_visits RPC with friend ID and returns profile payload', async () => {
      const mockProfile = {
        id: 'friend-101',
        name: 'Jane Doe',
        avatar_url: 'https://example.com/jane.jpg',
        visited_wineries: [{ winery_id: 1, name: 'Boundary Breaks' }],
      };

      mockRpc.mockResolvedValueOnce({ data: mockProfile, error: null });

      const profile = await SocialService.getFriendProfile('friend-101');

      expect(mockRpc).toHaveBeenCalledWith('get_friend_profile_with_visits', {
        p_friend_id: 'friend-101',
      });
      expect(profile).toEqual(mockProfile);
    });

    it('throws error when get_friend_profile_with_visits RPC fails', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: new Error('Profile is private') });

      await expect(SocialService.getFriendProfile('friend-private')).rejects.toThrow('Profile is private');
    });

    // Invariant / Hardening Guard (Red Phase)
    it('validates friendId parameter and rejects empty string before issuing RPC', async () => {
      await expect(SocialService.getFriendProfile('')).rejects.toThrow(/friend/i);
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe('getFriendDataForWinery', () => {
    it('fetches ratings and activity concurrently via parallel RPC execution', async () => {
      const mockRatings = [{ user_id: 'u-1', rating: 5, notes: 'Amazing Cabernet Franc' }];
      const mockActivity = { favoritedBy: ['u-1'], wishlistedBy: ['u-2'] };

      mockRpc
        .mockResolvedValueOnce({ data: mockRatings, error: null })
        .mockResolvedValueOnce({ data: mockActivity, error: null });

      const result = await SocialService.getFriendDataForWinery(42 as WineryDbId);

      expect(mockRpc).toHaveBeenCalledTimes(2);
      expect(mockRpc).toHaveBeenCalledWith('get_friends_ratings_for_winery', { p_winery_id: 42 });
      expect(mockRpc).toHaveBeenCalledWith('get_friends_activity_for_winery', { p_winery_id: 42 });
      expect(result).toEqual({
        ratings: mockRatings,
        activity: mockActivity,
      });
    });

    it('provides fallback defaults when RPC returns null data', async () => {
      mockRpc
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      const result = await SocialService.getFriendDataForWinery(42 as WineryDbId);

      expect(result).toEqual({
        ratings: [],
        activity: { favoritedBy: [], wishlistedBy: [] },
      });
    });

    it('throws error if ratings RPC returns an error', async () => {
      mockRpc
        .mockResolvedValueOnce({ data: null, error: new Error('Ratings error') })
        .mockResolvedValueOnce({ data: { favoritedBy: [] }, error: null });

      await expect(SocialService.getFriendDataForWinery(42 as WineryDbId)).rejects.toThrow('Ratings error');
    });

    it('throws error if activity RPC returns an error', async () => {
      mockRpc
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: null, error: new Error('Activity error') });

      await expect(SocialService.getFriendDataForWinery(42 as WineryDbId)).rejects.toThrow('Activity error');
    });
  });
});
