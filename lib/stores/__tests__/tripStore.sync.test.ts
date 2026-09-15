import { act } from '@testing-library/react';
import { createMockTrip, createMockWinery } from '@/lib/test-utils/fixtures';
import { useTripStore } from '../tripStore';

let mockTripService = {
  createTrip: jest.fn(),
  deleteTrip: jest.fn(),
  updateTrip: jest.fn(),
};

(globalThis as any)._TRIP_SYNC_MOCKS = {
  mockTripService,
};

jest.mock('@/lib/services/tripService', () => ({
  TripService: {
    createTrip: (...args: any[]) => (globalThis as any)._TRIP_SYNC_MOCKS.mockTripService.createTrip(...args),
    deleteTrip: (...args: any[]) => (globalThis as any)._TRIP_SYNC_MOCKS.mockTripService.deleteTrip(...args),
    updateTrip: (...args: any[]) => (globalThis as any)._TRIP_SYNC_MOCKS.mockTripService.updateTrip(...args),
  },
}));

jest.mock('@/lib/stores/wineryStore', () => ({
  useWineryStore: {
    getState: jest.fn(() => ({
      ensureWineryDetails: jest.fn().mockResolvedValue({}),
      updateWinery: jest.fn(),
      upsertWinery: jest.fn(),
    })),
  },
}));

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'user-123' } } }, error: null }),
    },
    rpc: jest.fn().mockResolvedValue({ data: {}, error: null }),
  })),
}));

describe('tripStore sync locking', () => {
  beforeEach(() => {
    mockTripService = {
      createTrip: jest.fn(),
      deleteTrip: jest.fn(),
      updateTrip: jest.fn(),
    };
    (globalThis as any)._TRIP_SYNC_MOCKS = { mockTripService };

    useTripStore.getState().reset();
    
    jest.spyOn(Date, 'now').mockReturnValue(1000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should update lastActionTimestamp when createTrip is called', async () => {
    mockTripService.createTrip.mockResolvedValue(createMockTrip());
    
    await act(async () => {
      await useTripStore.getState().createTrip({ name: 'Test' });
    });

    expect(useTripStore.getState().lastActionTimestamp).toBe(1000);
  });

  it('should update lastActionTimestamp when deleteTrip is called', async () => {
    mockTripService.deleteTrip.mockResolvedValue(undefined);
    
    await act(async () => {
      await useTripStore.getState().deleteTrip('123');
    });

    expect(useTripStore.getState().lastActionTimestamp).toBe(1000);
  });

  it('should update lastActionTimestamp when updateTrip is called', async () => {
    mockTripService.updateTrip.mockResolvedValue(undefined);
    
    await act(async () => {
      await useTripStore.getState().updateTrip('123', { name: 'Updated' });
    });

    expect(useTripStore.getState().lastActionTimestamp).toBe(1000);
  });

  it('should update lastActionTimestamp when updateWineryOrder is called', async () => {
    useTripStore.setState({ trips: [createMockTrip({ id: 123, wineries: [createMockWinery({ dbId: 1 as any })] })] });
    mockTripService.updateTrip.mockResolvedValue(undefined);
    
    await act(async () => {
      await useTripStore.getState().updateWineryOrder('123', [1 as any]);
    });

    expect(useTripStore.getState().lastActionTimestamp).toBe(1000);
  });
});
