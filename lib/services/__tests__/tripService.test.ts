jest.mock('@/utils/supabase/client');

describe('TripService', () => {
  let TripService: any;
  let mockSupabase: any;
  let mockRange: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    
    // Get fresh mocks after reset
    const { createClient } = require('@/utils/supabase/client');
    TripService = require('../tripService').TripService;
    
    mockRange = jest.fn();
    mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: mockRange,
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
  });

  describe('getTrips', () => {
    it('should convert trip IDs to Number', async () => {
      const mockTrips = [
        { id: '123', name: 'Trip 1', trip_date: '2026-05-10', trip_wineries: [{ count: 2 }] },
        { id: '456', name: 'Trip 2', trip_date: '2026-05-11', trip_wineries: [{ count: 0 }] },
      ];

      mockRange.mockResolvedValue({
        data: mockTrips,
        error: null,
        count: 2,
      });

      const result = await TripService.getTrips(1, 'upcoming');

      expect(typeof result.trips[0].id).toBe('number');
      expect(result.trips[0].id).toBe(123);
      expect(typeof result.trips[1].id).toBe('number');
      expect(result.trips[1].id).toBe(456);
    });
  });

  describe('getUpcomingTrips', () => {
    it('should convert trip IDs to Number', async () => {
      const mockTrips = [
        { id: '789', name: 'Upcoming Trip', trip_date: '2026-06-10', trip_wineries: [{ count: 1 }] },
      ];

      mockRange.mockResolvedValue({
        data: mockTrips,
        error: null,
        count: 1,
      });

      const result = await TripService.getUpcomingTrips();

      expect(typeof result[0].id).toBe('number');
      expect(result[0].id).toBe(789);
    });
  });

  describe('getTripById', () => {
    it('should convert trip ID to Number', async () => {
      const { createClient } = require('@/utils/supabase/client');
      const mockRpc = jest.fn().mockResolvedValue({
        data: { id: '456', name: 'Single Trip' },
        error: null
      });
      (createClient() as any).rpc = mockRpc;

      const result = await TripService.getTripById('456');

      expect(typeof result.id).toBe('number');
      expect(result.id).toBe(456);
    });
  });

  describe('getTripsForDate', () => {
    it('should convert trip IDs to Number', async () => {
      const { createClient } = require('@/utils/supabase/client');
      const mockRpc = jest.fn().mockResolvedValue({
        data: [
          { id: '101', name: 'Date Trip 1' },
          { id: '102', name: 'Date Trip 2' },
        ],
        error: null
      });
      (createClient() as any).rpc = mockRpc;

      const result = await TripService.getTripsForDate('2026-05-10');

      expect(typeof result[0].id).toBe('number');
      expect(result[0].id).toBe(101);
      expect(typeof result[1].id).toBe('number');
      expect(result[1].id).toBe(102);
    });
  });
});
