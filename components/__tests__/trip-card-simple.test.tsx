import { render, screen, fireEvent } from '@testing-library/react';
import TripCardSimple from '../trip-card-simple';
import { useUserStore } from '@/lib/stores/userStore';
import { useUIStore } from '@/lib/stores/uiStore';
import { useTripActions } from '@/hooks/use-trip-actions';
import { createMockTrip, createMockWinery } from '@/lib/test-utils/fixtures';
import { GooglePlaceId, WineryDbId } from '@/lib/types';

jest.mock('@/hooks/use-trip-actions');
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));
jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div data-testid="dropdown-menu">{children}</div>,
  DropdownMenuTrigger: ({ children, ...props }: any) => (
    <div data-testid="dropdown-menu-trigger" {...props}>{children}</div>
  ),
  DropdownMenuContent: ({ children, ...props }: any) => (
    <div data-testid="dropdown-menu-content" role="menu" {...props}>{children}</div>
  ),
  DropdownMenuItem: ({ children, onClick, onSelect, ...props }: any) => (
    <button
      role="menuitem"
      onClick={(e) => {
        onClick?.(e);
        onSelect?.(e);
      }}
      {...props}
    >
      {children}
    </button>
  ),
}));

describe('TripCardSimple (Container)', () => {
  const mockOnDelete = jest.fn();
  const mockOpenShareDialog = jest.fn();
  const mockHandleTripNavigation = jest.fn();
  const mockHandleExportToMaps = jest.fn();

  const mockWinery = createMockWinery({
    id: 'place_1' as GooglePlaceId,
    dbId: 101 as WineryDbId,
    name: 'Dr. Konstantin Frank',
  });

  beforeEach(() => {
    jest.clearAllMocks();

    useUIStore.setState({
      openShareDialog: mockOpenShareDialog,
    });

    useUserStore.setState({
      user: { id: 'user_123', email: 'owner@example.com' } as any,
    });

    (useTripActions as jest.Mock).mockReturnValue({
      currentMembers: [],
      handleTripNavigation: mockHandleTripNavigation,
      handleExportToMaps: mockHandleExportToMaps,
      selectedFriends: [],
      saveTripMembers: jest.fn(),
    });
  });

  describe('Trip Navigation Delegation', () => {
    it('delegates to handleTripNavigation when Google Maps is selected', () => {
      const trip = createMockTrip({
        id: 42,
        user_id: 'user_123',
        wineries_count: 1,
        wineries: [mockWinery],
      });

      render(<TripCardSimple trip={trip} onDelete={mockOnDelete} />);

      expect(useTripActions).toHaveBeenCalledWith(trip);

      const navBtn = screen.getByRole('button', { name: /Trip Navigation/i });
      expect(navBtn).not.toBeDisabled();

      const googleItem = screen.getByRole('menuitem', { name: /Google Maps/i });
      fireEvent.click(googleItem);

      expect(mockHandleTripNavigation).toHaveBeenCalledWith('google');
      expect(mockHandleExportToMaps).not.toHaveBeenCalled();
    });

    it('delegates to handleTripNavigation when Apple Maps is selected', () => {
      const trip = createMockTrip({
        id: 42,
        user_id: 'user_123',
        wineries_count: 1,
        wineries: [mockWinery],
      });

      render(<TripCardSimple trip={trip} onDelete={mockOnDelete} />);

      const appleItem = screen.getByRole('menuitem', { name: /Apple Maps/i });
      fireEvent.click(appleItem);

      expect(mockHandleTripNavigation).toHaveBeenCalledWith('apple');
      expect(mockHandleExportToMaps).not.toHaveBeenCalled();
    });

    it('delegates to handleTripNavigation when Waze is selected', () => {
      const trip = createMockTrip({
        id: 42,
        user_id: 'user_123',
        wineries_count: 1,
        wineries: [mockWinery],
      });

      render(<TripCardSimple trip={trip} onDelete={mockOnDelete} />);

      const wazeItem = screen.getByRole('menuitem', { name: /Waze/i });
      fireEvent.click(wazeItem);

      expect(mockHandleTripNavigation).toHaveBeenCalledWith('waze');
      expect(mockHandleExportToMaps).not.toHaveBeenCalled();
    });

    it('falls back to handleExportToMaps when handleTripNavigation is not provided (backwards compatibility)', () => {
      (useTripActions as jest.Mock).mockReturnValue({
        currentMembers: [],
        handleTripNavigation: undefined,
        handleExportToMaps: mockHandleExportToMaps,
        selectedFriends: [],
        saveTripMembers: jest.fn(),
      });

      const trip = createMockTrip({
        id: 42,
        user_id: 'user_123',
        wineries_count: 1,
        wineries: [mockWinery],
      });

      render(<TripCardSimple trip={trip} onDelete={mockOnDelete} />);

      const googleItem = screen.getByRole('menuitem', { name: /Google Maps/i });
      fireEvent.click(googleItem);

      expect(mockHandleExportToMaps).toHaveBeenCalledWith('google');
    });
  });

  it('correctly sets isOwner true when logged in user matches trip.user_id', () => {
    const trip = createMockTrip({
      id: 42,
      user_id: 'user_123',
      wineries_count: 1,
      wineries: [mockWinery],
    });

    render(<TripCardSimple trip={trip} onDelete={mockOnDelete} />);

    expect(screen.getByTestId('share-trip-btn')).toBeInTheDocument();
    expect(screen.getByTestId('delete-trip-btn')).toBeInTheDocument();
  });

  it('correctly sets isOwner false when logged in user does not match trip.user_id', () => {
    const trip = createMockTrip({
      id: 42,
      user_id: 'different_user',
      wineries_count: 1,
      wineries: [mockWinery],
    });

    render(<TripCardSimple trip={trip} onDelete={mockOnDelete} />);

    expect(screen.queryByTestId('share-trip-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delete-trip-btn')).not.toBeInTheDocument();
  });
});
