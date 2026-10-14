import { renderHook, act } from '@testing-library/react';
import { useTripActions } from '../use-trip-actions';
import { useFriendStore } from '@/lib/stores/friendStore';
import { useTripStore } from '@/lib/stores/tripStore';
import { useToast } from '@/hooks/use-toast';
import { createMockTrip, createMockWinery } from '@/lib/test-utils/fixtures';
import { GooglePlaceId, WineryDbId } from '@/lib/types';
import { NavigationProvider } from '@/lib/utils/trip-navigation';

jest.mock('@/hooks/use-toast', () => ({
  useToast: jest.fn(),
}));

describe('useTripActions', () => {
  const mockToast = jest.fn();
  const mockFetchFriends = jest.fn();
  const mockAddMembersToTrip = jest.fn();
  let originalWindowOpen: typeof window.open;
  let originalGeolocation: Geolocation | undefined;

  const mockWinery1 = createMockWinery({
    id: 'place_1' as GooglePlaceId,
    dbId: 101 as WineryDbId,
    name: 'Dr. Konstantin Frank',
    address: '9749 Middle Rd, Hammondsport, NY',
    latitude: 42.44,
    longitude: -76.5,
  });

  const mockWinery2 = createMockWinery({
    id: 'place_2' as GooglePlaceId,
    dbId: 102 as WineryDbId,
    name: 'Ravines Wine Cellars',
    address: '400 Barracks Rd, Geneva, NY',
    latitude: 42.86,
    longitude: -76.98,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (useToast as jest.Mock).mockReturnValue({ toast: mockToast });

    useFriendStore.setState({
      fetchFriends: mockFetchFriends,
      friends: [],
    });

    useTripStore.setState({
      addMembersToTrip: mockAddMembersToTrip,
    });

    originalWindowOpen = window.open;
    window.open = jest.fn();
    originalGeolocation = navigator.geolocation;
  });

  afterEach(() => {
    window.open = originalWindowOpen;
    Object.defineProperty(navigator, 'geolocation', {
      value: originalGeolocation,
      configurable: true,
      writable: true,
    });
  });

  it('fetches friends on mount', () => {
    const trip = createMockTrip({ id: 1 });
    renderHook(() => useTripActions(trip));

    expect(mockFetchFriends).toHaveBeenCalledTimes(1);
  });

  describe('handleExportToMaps', () => {
    it('shows destructive toast and does not open a window if trip.wineries is undefined or empty', () => {
      const tripEmpty = createMockTrip({ id: 1, wineries: [] });
      const { result } = renderHook(() => useTripActions(tripEmpty));

      act(() => {
        const handleExport = result.current.handleExportToMaps as (provider?: NavigationProvider) => void;
        handleExport();
      });

      expect(mockToast).toHaveBeenCalledWith({
        variant: 'destructive',
        description: 'No wineries in this trip to navigate to.',
      });
      expect(window.open).not.toHaveBeenCalled();
    });

    it('synchronously opens Google Maps navigation without querying navigator.geolocation', () => {
      const trip = createMockTrip({
        id: 1,
        wineries: [mockWinery1, mockWinery2],
      });

      const mockGetCurrentPosition = jest.fn();
      Object.defineProperty(navigator, 'geolocation', {
        value: { getCurrentPosition: mockGetCurrentPosition },
        configurable: true,
        writable: true,
      });

      const { result } = renderHook(() => useTripActions(trip));

      act(() => {
        const handleExport = result.current.handleExportToMaps as (provider?: NavigationProvider) => void;
        handleExport('google');
      });

      expect(mockGetCurrentPosition).not.toHaveBeenCalled();

      const expectedDest = encodeURIComponent(`${mockWinery2.name}, ${mockWinery2.address}`);
      const expectedWaypoint = encodeURIComponent(`${mockWinery1.name}, ${mockWinery1.address}`);
      const expectedUrl = `https://www.google.com/maps/dir/?api=1&destination=${expectedDest}&waypoints=${expectedWaypoint}`;

      expect(window.open).toHaveBeenCalledWith(expectedUrl, '_blank', 'noopener,noreferrer');
    });

    it('defaults to Google Maps when called without provider argument', () => {
      const trip = createMockTrip({
        id: 1,
        wineries: [mockWinery1],
      });

      const { result } = renderHook(() => useTripActions(trip));

      act(() => {
        const handleExport = result.current.handleExportToMaps as (provider?: NavigationProvider) => void;
        handleExport();
      });

      const expectedDest = encodeURIComponent(`${mockWinery1.name}, ${mockWinery1.address}`);
      const expectedUrl = `https://www.google.com/maps/dir/?api=1&destination=${expectedDest}`;

      expect(window.open).toHaveBeenCalledWith(expectedUrl, '_blank', 'noopener,noreferrer');
    });

    it('synchronously opens Apple Maps navigation for "apple" provider', () => {
      const trip = createMockTrip({
        id: 1,
        wineries: [mockWinery1, mockWinery2],
      });

      const mockGetCurrentPosition = jest.fn();
      Object.defineProperty(navigator, 'geolocation', {
        value: { getCurrentPosition: mockGetCurrentPosition },
        configurable: true,
        writable: true,
      });

      const { result } = renderHook(() => useTripActions(trip));

      act(() => {
        const handleExport = result.current.handleExportToMaps as (provider?: NavigationProvider) => void;
        handleExport('apple');
      });

      expect(mockGetCurrentPosition).not.toHaveBeenCalled();

      const expectedDest = encodeURIComponent(`${mockWinery1.name}, ${mockWinery1.address}`);
      const expectedUrl = `https://maps.apple.com/?daddr=${expectedDest}&dirflg=d`;

      expect(window.open).toHaveBeenCalledWith(expectedUrl, '_blank', 'noopener,noreferrer');
    });

    it('synchronously opens Waze navigation for "waze" provider', () => {
      const trip = createMockTrip({
        id: 1,
        wineries: [mockWinery1, mockWinery2],
      });

      const mockGetCurrentPosition = jest.fn();
      Object.defineProperty(navigator, 'geolocation', {
        value: { getCurrentPosition: mockGetCurrentPosition },
        configurable: true,
        writable: true,
      });

      const { result } = renderHook(() => useTripActions(trip));

      act(() => {
        const handleExport = result.current.handleExportToMaps as (provider?: NavigationProvider) => void;
        handleExport('waze');
      });

      expect(mockGetCurrentPosition).not.toHaveBeenCalled();

      const expectedUrl = `https://waze.com/ul?ll=${mockWinery1.latitude},${mockWinery1.longitude}&navigate=yes`;

      expect(window.open).toHaveBeenCalledWith(expectedUrl, '_blank', 'noopener,noreferrer');
    });

    it('falls back to Google Maps when an invalid provider is provided', () => {
      const trip = createMockTrip({
        id: 1,
        wineries: [mockWinery1],
      });

      const { result } = renderHook(() => useTripActions(trip));

      act(() => {
        const handleExport = result.current.handleExportToMaps as (provider?: NavigationProvider) => void;
        handleExport('unknown' as NavigationProvider);
      });

      const expectedDest = encodeURIComponent(`${mockWinery1.name}, ${mockWinery1.address}`);
      const expectedUrl = `https://www.google.com/maps/dir/?api=1&destination=${expectedDest}`;

      expect(window.open).toHaveBeenCalledWith(expectedUrl, '_blank', 'noopener,noreferrer');
    });
  });

  describe('saveTripMembers', () => {
    it('successfully updates members and triggers success toast', async () => {
      mockAddMembersToTrip.mockResolvedValueOnce(undefined);
      const trip = createMockTrip({ id: 10 });
      const { result } = renderHook(() => useTripActions(trip));

      await act(async () => {
        await result.current.saveTripMembers(['friend-1', 'friend-2']);
      });

      expect(mockAddMembersToTrip).toHaveBeenCalledWith('10', ['friend-1', 'friend-2']);
      expect(mockToast).toHaveBeenCalledWith({ description: 'Trip members updated.' });
    });

    it('triggers error toast when addMembersToTrip fails', async () => {
      mockAddMembersToTrip.mockRejectedValueOnce(new Error('DB failure'));
      const trip = createMockTrip({ id: 10 });
      const { result } = renderHook(() => useTripActions(trip));

      await act(async () => {
        await result.current.saveTripMembers(['friend-1']);
      });

      expect(mockToast).toHaveBeenCalledWith({
        variant: 'destructive',
        description: 'Failed to update members.',
      });
    });
  });
});