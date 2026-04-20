import { act } from '@testing-library/react';
import { createMockTrip, createMockWinery } from '@/lib/test-utils/fixtures';

describe('tripStore sync locking', () => {
  let useTripStore: any;
  let mockTripService: any;

  beforeEach(() => {
    jest.resetModules();

    mockTripService = {
      createTrip: jest.fn(),
      deleteTrip: jest.fn(),
      updateTrip: jest.fn(),
    };

    jest.doMock('@/lib/services/tripService', () => ({
      TripService: mockTripService
    }));

    jest.doMock('@/lib/stores/wineryStore', () => ({
      useWineryStore: {
        getState: jest.fn(() => ({
          ensureWineryDetails: jest.fn().mockResolvedValue({}),
          updateWinery: jest.fn(),
        })),
      },
    }));

    jest.doMock('@/lib/stores/wineryDataStore', () => ({
      useWineryDataStore: {
        getState: jest.fn(() => ({
          upsertWinery: jest.fn(),
        })),
      },
    }));

    jest.doMock('@/utils/supabase/client', () => ({
      createClient: jest.fn(() => ({
        rpc: jest.fn().mockResolvedValue({ data: {}, error: null }),
      })),
    }));

    useTripStore = require('../tripStore').useTripStore;
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
