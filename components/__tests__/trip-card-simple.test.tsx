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

describe('TripCardSimple (Container)', () => {
  const mockOnDelete = jest.fn();
  const mockOpenShareDialog = jest.fn();
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
      handleExportToMaps: mockHandleExportToMaps,
      selectedFriends: [],
      saveTripMembers: jest.fn(),
    });
  });

  it('renders TripCardSimplePresentational and wires handleExportToMaps from useTripActions', () => {
    const trip = createMockTrip({
      id: 42,
      user_id: 'user_123',
      wineries_count: 1,
      wineries: [mockWinery],
    });

    render(<TripCardSimple trip={trip} onDelete={mockOnDelete} />);

    expect(useTripActions).toHaveBeenCalledWith(trip);

    const exportBtn = screen.getByRole('button', { name: /Export to Google Maps/i });
    expect(exportBtn).not.toBeDisabled();

    fireEvent.click(exportBtn);
    expect(mockHandleExportToMaps).toHaveBeenCalledTimes(1);
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
