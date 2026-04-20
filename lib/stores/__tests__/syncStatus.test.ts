import { act } from '@testing-library/react';
import { createMockTrip } from '@/lib/test-utils/fixtures';

describe('useTripStore SyncStatus', () => {
  let useTripStore: any;
  let mockTripService: any;

  beforeEach(() => {
    jest.resetModules();

    mockTripService = {
      getTrips: jest.fn(),
      getTripById: jest.fn(),
      getUpcomingTrips: jest.fn(),
      getTripsForDate: jest.fn(),
      createTrip: jest.fn(),
      deleteTrip: jest.fn(),
      updateTrip: jest.fn(),
    };

    jest.doMock('@/lib/services/tripService', () => ({
      TripService: mockTripService
    }));

    jest.doMock('@/utils/supabase/client', () => ({
      createClient: jest.fn(() => ({
        rpc: jest.fn(),
        from: jest.fn(() => ({
          select: jest.fn(),
          insert: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        })),
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
          getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user' } } }, error: null }),
        }
      })),
    }));

    useTripStore = require('../tripStore').useTripStore;
    useTripStore.getState().reset();
  });

  it('should set syncStatus to pending during createTrip and synced after completion', async () => {
    const newTripParams = { name: 'New Trip', trip_date: '2023-01-01' };
    const createdTrip = createMockTrip({ ...newTripParams, id: 123, syncStatus: 'synced' });
    
    let resolveService: (value: any) => void;
    const servicePromise = new Promise((resolve) => {
      resolveService = resolve;
    });
    mockTripService.createTrip.mockReturnValue(servicePromise);

    let createPromise: Promise<any>;
    await act(async () => {
      createPromise = useTripStore.getState().createTrip(newTripParams);
    });

    // Check optimistic state
    const optimisticState = useTripStore.getState();
    const optimisticTrip = optimisticState.trips.find((t: any) => t.name === 'New Trip');
    expect(optimisticTrip).toBeDefined();
    expect(optimisticTrip.syncStatus).toBe('pending');

    await act(async () => {
      resolveService!(createdTrip);
      await createPromise!;
    });

    // Check final state
    const finalState = useTripStore.getState();
    const finalTrip = finalState.trips.find((t: any) => t.id === 123);
    expect(finalTrip).toBeDefined();
    expect(finalTrip.syncStatus).toBe('synced');
  });

  it('should set syncStatus to error if createTrip fails', async () => {
    const newTripParams = { name: 'Failing Trip', trip_date: '2023-01-01' };
    
    let rejectService: (reason: any) => void;
    const servicePromise = new Promise((_, reject) => {
      rejectService = reject;
    });
    mockTripService.createTrip.mockReturnValue(servicePromise);

    let createPromise: Promise<any>;
    await act(async () => {
      createPromise = useTripStore.getState().createTrip(newTripParams);
    });

    await act(async () => {
      rejectService!(new Error('Network error'));
      try {
        await createPromise!;
      } catch (e) {
        // expected
      }
    });

    const state = useTripStore.getState();
    const failedTrip = state.trips.find((t: any) => t.name === 'Failing Trip');
    expect(failedTrip).toBeDefined();
    expect(failedTrip.syncStatus).toBe('error');
  });
});

describe('useVisitStore SyncStatus', () => {
  let useVisitStore: any;
  let mockWineryStore: any;
  let mockRpc: jest.Mock;

  beforeEach(() => {
    jest.resetModules();

    mockRpc = jest.fn();

    mockWineryStore = {
      getState: jest.fn(() => ({
        addVisitToWinery: jest.fn(),
        replaceVisit: jest.fn(),
        optimisticallyDeleteVisit: jest.fn(),
        confirmOptimisticUpdate: jest.fn(),
        getWineries: jest.fn(() => []),
      })),
    };

    jest.doMock('@/lib/stores/wineryStore', () => ({
      useWineryStore: mockWineryStore
    }));

    jest.doMock('@/utils/supabase/client', () => ({
      createClient: jest.fn(() => ({
        rpc: mockRpc,
        from: jest.fn(() => ({
          select: jest.fn(),
          insert: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
          single: jest.fn(),
        })),
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
          getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user' } } }, error: null }),
        },
        storage: {
          from: jest.fn(() => ({
            upload: jest.fn().mockResolvedValue({ data: { path: 'path' }, error: null }),
            remove: jest.fn().mockResolvedValue({ data: {}, error: null }),
          })),
        }
      })),
    }));

    useVisitStore = require('../visitStore').useVisitStore;
    useVisitStore.getState().reset();
  });

  it('should set syncStatus to pending during saveVisit and synced after completion', async () => {
    const { createMockWinery } = require('@/lib/test-utils/fixtures');
    const winery = createMockWinery();
    const visitData = { visit_date: '2023-01-01', user_review: 'Great!', rating: 5, photos: [] };
    
    mockRpc.mockReturnValue(new Promise((resolve) => {
      setTimeout(() => resolve({ data: { visit_id: '123', winery_id: 1 }, error: null }), 50);
    }));

    let savePromise: Promise<any>;
    await act(async () => {
      savePromise = useVisitStore.getState().saveVisit(winery, visitData);
    });

    // Check optimistic state
    const optimisticState = useVisitStore.getState();
    const optimisticVisit = optimisticState.visits[0];
    expect(optimisticVisit).toBeDefined();
    expect(optimisticVisit.syncStatus).toBe('pending');

    await act(async () => {
      await savePromise!;
    });

    // Check final state
    const finalState = useVisitStore.getState();
    const finalVisit = finalState.visits.find((v: any) => v.id === '123');
    expect(finalVisit).toBeDefined();
    expect(finalVisit.syncStatus).toBe('synced');
  });
});
