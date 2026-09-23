import { TripService } from '../tripService';
import { Trip, Winery, GooglePlaceId, WineryDbId } from '@/lib/types';
import { createMockWinery } from '@/lib/test-utils/fixtures';

let mockRpc = jest.fn();
let mockFrom = jest.fn();
let mockFindWineryByDbId = jest.fn();

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  })),
}));

jest.mock('@/lib/stores/wineryStore', () => ({
  findWineryByDbId: (...args: unknown[]) => mockFindWineryByDbId(...args),
}));

describe('TripService Mutation Test Suite (QA-14)', () => {
  let mockBuilder: any;

  beforeEach(() => {
    mockRpc.mockReset();
    mockFrom.mockReset();
    mockFindWineryByDbId.mockReset();

    mockBuilder = {
      delete: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      then: (resolve: any) => Promise.resolve(resolve({ data: null, error: null })),
    };

    mockFrom.mockReturnValue(mockBuilder);
  });

  describe('createTrip', () => {
    const mockWinery1: Winery = createMockWinery({
      id: 'place_1' as GooglePlaceId,
      dbId: 101 as WineryDbId,
      name: 'Dr. Konstantin Frank Winery',
      address: '9749 Middle Rd, Hammondsport, NY',
      latitude: 42.474,
      longitude: -77.172,
    });

    const mockWinery2: Winery = createMockWinery({
      id: 'place_2' as GooglePlaceId,
      dbId: 102 as WineryDbId,
      name: 'Ravines Wine Cellars',
      address: '4000 State Route 14, Geneva, NY',
      latitude: 42.793,
      longitude: -76.963,
    });

    it('creates a trip with a single winery and returns the populated trip', async () => {
      mockRpc
        .mockResolvedValueOnce({ data: { trip_id: 501 }, error: null }) // create_trip_with_winery
        .mockResolvedValueOnce({ data: { id: 501, name: 'Keuka Tour', wineries: [mockWinery1] }, error: null }); // get_trip_details via getTripById

      const tripInput: Partial<Trip> = {
        name: 'Keuka Tour',
        trip_date: '2026-10-15',
        wineries: [mockWinery1],
      };

      const result = await TripService.createTrip(tripInput, 'idemp-key-1');

      expect(mockRpc).toHaveBeenCalledWith('create_trip_with_winery', {
        p_trip_name: 'Keuka Tour',
        p_trip_date: '2026-10-15',
        p_winery_data: expect.objectContaining({
          id: 'place_1',
          name: 'Dr. Konstantin Frank Winery',
        }),
        p_members: [],
        p_idempotency_key: 'idemp-key-1',
      });
      expect(result.id).toBe(501);
    });

    it('chains multiple wineries via addWineryToExistingTrip when multiple wineries provided', async () => {
      mockFindWineryByDbId.mockReturnValue(mockWinery2);

      mockRpc
        .mockResolvedValueOnce({ data: { trip_id: 502 }, error: null }) // create_trip_with_winery for winery1
        .mockResolvedValueOnce({ data: { success: true }, error: null }) // add_winery_to_trip for winery2
        .mockResolvedValueOnce({ data: { id: 502, name: 'Multi Tour', wineries: [mockWinery1, mockWinery2] }, error: null }); // get_trip_details

      const tripInput: Partial<Trip> = {
        name: 'Multi Tour',
        trip_date: '2026-10-16',
        wineries: [mockWinery1, mockWinery2],
      };

      const result = await TripService.createTrip(tripInput);

      expect(mockRpc).toHaveBeenCalledWith('create_trip_with_winery', expect.any(Object));
      expect(mockRpc).toHaveBeenCalledWith('add_winery_to_trip', expect.objectContaining({
        p_trip_id: 502,
        p_winery_data: expect.objectContaining({ id: 'place_2' }),
      }));
      expect(result.id).toBe(502);
    });

    it('creates an empty trip without wineries when no wineries are provided', async () => {
      mockRpc
        .mockResolvedValueOnce({ data: { id: 503 }, error: null }) // create_trip
        .mockResolvedValueOnce({ data: { id: 503, name: 'Empty Trip', wineries: [] }, error: null }); // getTripById

      const tripInput: Partial<Trip> = {
        name: 'Empty Trip',
        trip_date: '2026-10-17',
      };

      const result = await TripService.createTrip(tripInput, 'idemp-empty');

      expect(mockRpc).toHaveBeenCalledWith('create_trip', {
        p_name: 'Empty Trip',
        p_trip_date: '2026-10-17',
        p_idempotency_key: 'idemp-empty',
      });
      expect(result.id).toBe(503);
    });

    it('throws error when primary create_trip RPC fails', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: new Error('Creation failed') });

      await expect(TripService.createTrip({ name: 'Failing Trip' })).rejects.toThrow('Creation failed');
    });

    // Invariant / Hardening Guard (Red Phase): Multi-winery chained rollback on secondary failure
    it('rolls back and cleans up partial trip when secondary chained winery addition fails', async () => {
      mockFindWineryByDbId.mockReturnValue(null);

      mockRpc
        .mockResolvedValueOnce({ data: { trip_id: 505 }, error: null }) // create_trip_with_winery succeeds
        .mockResolvedValueOnce({ data: null, error: new Error('Secondary winery RPC failure') }) // add_winery_to_trip fails
        .mockResolvedValueOnce({ data: null, error: null }); // delete_trip (rollback)

      const tripInput: Partial<Trip> = {
        name: 'Rollback Tour',
        trip_date: '2026-10-18',
        wineries: [mockWinery1, mockWinery2],
      };

      await expect(TripService.createTrip(tripInput)).rejects.toThrow('Secondary winery RPC failure');
      // Hardening contract: must invoke delete_trip rollback to prevent orphaned partial trip
      expect(mockRpc).toHaveBeenCalledWith('delete_trip', { p_trip_id: 505 });
    });
  });

  describe('deleteTrip', () => {
    it('invokes delete_trip RPC with parsed integer ID', async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true }, error: null });

      await TripService.deleteTrip('301');

      expect(mockRpc).toHaveBeenCalledWith('delete_trip', { p_trip_id: 301 });
    });

    it('throws error when delete_trip RPC fails', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: new Error('Trip not found or unauthorized') });

      await expect(TripService.deleteTrip('302')).rejects.toThrow('Trip not found or unauthorized');
    });

    // Invariant / Hardening Guard (Red Phase): Invalid ID guards
    it('rejects invalid or non-numeric trip IDs before issuing DB RPC', async () => {
      await expect(TripService.deleteTrip('')).rejects.toThrow(/invalid trip id/i);
      await expect(TripService.deleteTrip('abc')).rejects.toThrow(/invalid trip id/i);
      await expect(TripService.deleteTrip('0')).rejects.toThrow(/invalid trip id/i);
      await expect(TripService.deleteTrip('-10')).rejects.toThrow(/invalid trip id/i);
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe('updateTrip', () => {
    it('handles winery reordering through reorder_trip_wineries RPC', async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true }, error: null });

      await TripService.updateTrip('401', { wineryOrder: [103, 101, 102] });

      expect(mockRpc).toHaveBeenCalledWith('reorder_trip_wineries', {
        p_trip_id: 401,
        p_winery_ids: [103, 101, 102],
      });
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('handles winery removal from trip_wineries table', async () => {
      mockBuilder.then = (resolve: any) => Promise.resolve(resolve({ data: null, error: null }));

      await TripService.updateTrip('401', { removeWineryId: 102 });

      expect(mockFrom).toHaveBeenCalledWith('trip_wineries');
      expect(mockBuilder.delete).toHaveBeenCalled();
      expect(mockBuilder.eq).toHaveBeenCalledWith('trip_id', '401');
      expect(mockBuilder.eq).toHaveBeenCalledWith('winery_id', 102);
    });

    it('handles single winery note update via update_trip_winery_notes RPC', async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true }, error: null });

      await TripService.updateTrip('401', {
        updateNote: { wineryId: 101, notes: 'Great barrel tasting' },
      });

      expect(mockRpc).toHaveBeenCalledWith('update_trip_winery_notes', {
        p_trip_id: 401,
        p_winery_id: 101,
        p_notes: 'Great barrel tasting',
      });
    });

    it('handles multi-winery notes map update via parallel RPC calls', async () => {
      mockRpc
        .mockResolvedValueOnce({ data: { success: true }, error: null })
        .mockResolvedValueOnce({ data: { success: true }, error: null });

      await TripService.updateTrip('401', {
        updateNote: {
          wineryId: 0,
          notes: {
            '101': 'First note',
            '102': 'Second note',
          },
        },
      });

      expect(mockRpc).toHaveBeenCalledTimes(2);
      expect(mockRpc).toHaveBeenCalledWith('update_trip_winery_notes', {
        p_trip_id: 401,
        p_winery_id: 101,
        p_notes: 'First note',
      });
      expect(mockRpc).toHaveBeenCalledWith('update_trip_winery_notes', {
        p_trip_id: 401,
        p_winery_id: 102,
        p_notes: 'Second note',
      });
    });

    it('handles standard trip field updates while stripping members array', async () => {
      mockBuilder.then = (resolve: any) => Promise.resolve(resolve({ data: null, error: null }));

      await TripService.updateTrip('401', {
        name: 'Updated Name',
        trip_date: '2026-11-01',
        members: [{ id: 'm-1', role: 'editor' }] as any,
      });

      expect(mockFrom).toHaveBeenCalledWith('trips');
      expect(mockBuilder.update).toHaveBeenCalledWith({
        name: 'Updated Name',
        trip_date: '2026-11-01',
      });
      expect(mockBuilder.eq).toHaveBeenCalledWith('id', '401');
    });
  });

  describe('addMemberByEmail', () => {
    it('invokes add_trip_member_by_email RPC and returns member data', async () => {
      const mockMember = { user_id: 'u-55', role: 'member', email: 'guest@example.com' };
      mockRpc.mockResolvedValueOnce({ data: mockMember, error: null });

      const result = await TripService.addMemberByEmail(201, 'guest@example.com');

      expect(mockRpc).toHaveBeenCalledWith('add_trip_member_by_email', {
        p_trip_id: 201,
        p_email: 'guest@example.com',
      });
      expect(result).toEqual(mockMember);
    });

    it('throws formatted error when add_trip_member_by_email fails', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: new Error('User not found') });

      await expect(TripService.addMemberByEmail(201, 'unknown@example.com')).rejects.toThrow('User not found');
    });

    // Invariant / Hardening Guard (Red Phase)
    it('validates email parameter and rejects invalid email before issuing RPC', async () => {
      await expect(TripService.addMemberByEmail(201, '')).rejects.toThrow(/email/i);
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('guarantees owner protection by enforcing .neq("role", "owner") in delete query builder', async () => {
      mockBuilder.then = (resolve: any) => Promise.resolve(resolve({ data: null, error: null }));

      const result = await TripService.removeMember(201, 'member-uuid-123');

      expect(mockFrom).toHaveBeenCalledWith('trip_members');
      expect(mockBuilder.delete).toHaveBeenCalled();
      expect(mockBuilder.eq).toHaveBeenCalledWith('trip_id', 201);
      expect(mockBuilder.eq).toHaveBeenCalledWith('user_id', 'member-uuid-123');
      // Crucial security invariant: owner protection guard
      expect(mockBuilder.neq).toHaveBeenCalledWith('role', 'owner');
      expect(result).toEqual({ success: true });
    });

    it('throws formatted error when member deletion query fails', async () => {
      mockBuilder.then = (resolve: any) => Promise.resolve(resolve({ data: null, error: new Error('DB permission denied') }));

      await expect(TripService.removeMember(201, 'member-uuid-123')).rejects.toThrow('DB permission denied');
    });

    // Invariant / Hardening Guard (Red Phase)
    it('rejects invalid tripId or userId before issuing query', async () => {
      await expect(TripService.removeMember(0, 'valid-user')).rejects.toThrow(/trip/i);
      await expect(TripService.removeMember(201, '')).rejects.toThrow(/user/i);
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('addWineryToNewTrip', () => {
    it('resolves winery from store and creates trip with winery data', async () => {
      const mockWinery = createMockWinery({ id: 'place_99' as GooglePlaceId, dbId: 99 as WineryDbId, name: 'Fox Run' });
      mockFindWineryByDbId.mockReturnValue(mockWinery);
      mockRpc.mockResolvedValueOnce({ data: { trip_id: 777 }, error: null });

      const result = await TripService.addWineryToNewTrip('2026-10-20', 99, 'Tasting note', 'Fox Run Day');

      expect(mockFindWineryByDbId).toHaveBeenCalledWith(99);
      expect(mockRpc).toHaveBeenCalledWith('create_trip_with_winery', expect.objectContaining({
        p_trip_name: 'Fox Run Day',
        p_trip_date: '2026-10-20',
        p_winery_data: expect.objectContaining({ id: 'place_99', name: 'Fox Run' }),
        p_notes: 'Tasting note',
      }));
      expect(result).toEqual({ success: true, tripId: 777 });
    });

    it('throws error when winery is missing from local store', async () => {
      mockFindWineryByDbId.mockReturnValue(undefined);

      await expect(TripService.addWineryToNewTrip('2026-10-20', 999, 'Note', 'Trip')).rejects.toThrow(
        'Winery data not found in local store for creation.'
      );
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe('addWineryToExistingTrip', () => {
    it('passes full standardized winery data when winery is present in local store', async () => {
      const mockWinery = createMockWinery({ id: 'place_88' as GooglePlaceId, dbId: 88 as WineryDbId, name: 'Red Newt' });
      mockFindWineryByDbId.mockReturnValue(mockWinery);
      mockRpc.mockResolvedValueOnce({ data: { success: true }, error: null });

      const result = await TripService.addWineryToExistingTrip(300, 88, 'Great Pinot');

      expect(mockRpc).toHaveBeenCalledWith('add_winery_to_trip', {
        p_trip_id: 300,
        p_winery_data: expect.objectContaining({ id: 'place_88', name: 'Red Newt' }),
        p_notes: 'Great Pinot',
      });
      expect(result).toEqual({ success: true });
    });

    it('falls back to passing winery ID when winery is not in local store', async () => {
      mockFindWineryByDbId.mockReturnValue(undefined);
      mockRpc.mockResolvedValueOnce({ data: { success: true }, error: null });

      const result = await TripService.addWineryToExistingTrip(300, 999, null);

      expect(mockRpc).toHaveBeenCalledWith('add_winery_to_trip', {
        p_trip_id: 300,
        p_winery_id: 999,
        p_notes: null,
      });
      expect(result).toEqual({ success: true });
    });

    it('throws error when add_winery_to_trip RPC fails', async () => {
      mockFindWineryByDbId.mockReturnValue(undefined);
      mockRpc.mockResolvedValueOnce({ data: null, error: new Error('Trip not editable') });

      await expect(TripService.addWineryToExistingTrip(300, 999, null)).rejects.toThrow('Trip not editable');
    });
  });

  describe('addWineryToTripByApi', () => {
    it('invokes add_winery_to_trips RPC with winery ID and array of trip IDs', async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true }, error: null });

      const result = await TripService.addWineryToTripByApi(55, [101, 102, 103]);

      expect(mockRpc).toHaveBeenCalledWith('add_winery_to_trips', {
        p_winery_id: 55,
        p_trip_ids: [101, 102, 103],
      });
      expect(result).toEqual({ success: true });
    });

    it('throws error when add_winery_to_trips RPC fails', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: new Error('RPC batch error') });

      await expect(TripService.addWineryToTripByApi(55, [101])).rejects.toThrow('RPC batch error');
    });
  });
});
