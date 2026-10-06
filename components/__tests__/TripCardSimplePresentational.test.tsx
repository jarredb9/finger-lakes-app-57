import { render, screen, fireEvent } from '@testing-library/react';
import TripCardSimple from '../TripCardSimplePresentational';
import { createMockTrip, createMockWinery } from '@/lib/test-utils/fixtures';
import { Trip, TripMember, GooglePlaceId, WineryDbId } from '@/lib/types';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarImage: ({ src, alt }: { src?: string; alt?: string }) => <img src={src} alt={alt} />,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('TripCardSimplePresentational', () => {
  const mockOnDelete = jest.fn();
  const mockOnShare = jest.fn();
  const mockOnExportToMaps = jest.fn();
  const mockDeleteTripAlert = undefined;

  const mockWinery1 = createMockWinery({
    id: 'place_1' as GooglePlaceId,
    dbId: 101 as WineryDbId,
    name: 'Dr. Konstantin Frank',
  });
  const mockWinery2 = createMockWinery({
    id: 'place_2' as GooglePlaceId,
    dbId: 102 as WineryDbId,
    name: 'Ravines Wine Cellars',
  });

  const defaultProps = {
    isOwner: true,
    currentMembers: [] as TripMember[],
    onDelete: mockOnDelete,
    onShare: mockOnShare,
    onExportToMaps: mockOnExportToMaps,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Badge Pluralization', () => {
    it('renders "1 Winery" when wineries_count is 1', () => {
      const trip: Trip = createMockTrip({
        name: 'Single Stop Trip',
        wineries_count: 1,
        wineries: [mockWinery1],
      });

      render(<TripCardSimple {...defaultProps} trip={trip} />);
      expect(screen.getByText(/1 Winery$/i)).toBeInTheDocument();
      expect(screen.queryByText(/1 Wineries/i)).not.toBeInTheDocument();
    });

    it('renders "0 Wineries" when wineries_count is 0', () => {
      const trip: Trip = createMockTrip({
        name: 'Empty Trip',
        wineries_count: 0,
        wineries: [],
      });

      render(<TripCardSimple {...defaultProps} trip={trip} />);
      expect(screen.getByText(/0 Wineries/i)).toBeInTheDocument();
    });

    it('renders "2 Wineries" when wineries_count is 2', () => {
      const trip: Trip = createMockTrip({
        name: 'Two Winery Tour',
        wineries_count: 2,
        wineries: [mockWinery1, mockWinery2],
      });

      render(<TripCardSimple {...defaultProps} trip={trip} />);
      expect(screen.getByText(/2 Wineries/i)).toBeInTheDocument();
    });

    it('falls back to wineries array length when wineries_count is undefined', () => {
      const singleWineryTrip: Trip = createMockTrip({
        name: 'Fallback Single Trip',
        wineries_count: undefined,
        wineries: [mockWinery1],
      });

      const { rerender } = render(<TripCardSimple {...defaultProps} trip={singleWineryTrip} />);
      expect(screen.getByText(/1 Winery$/i)).toBeInTheDocument();

      const multiWineryTrip: Trip = createMockTrip({
        name: 'Fallback Multi Trip',
        wineries_count: undefined,
        wineries: [mockWinery1, mockWinery2],
      });

      rerender(<TripCardSimple {...defaultProps} trip={multiWineryTrip} />);
      expect(screen.getByText(/2 Wineries/i)).toBeInTheDocument();

      const emptyWineryTrip: Trip = createMockTrip({
        name: 'Fallback Empty Trip',
        wineries_count: undefined,
        wineries: [],
      });

      rerender(<TripCardSimple {...defaultProps} trip={emptyWineryTrip} />);
      expect(screen.getByText(/0 Wineries/i)).toBeInTheDocument();
    });
  });

  describe('Interactions & Sync State', () => {
    it('navigates to trip details when "View Details" is clicked', () => {
      const trip: Trip = createMockTrip({ id: 42, name: 'Keuka Tour' });
      render(<TripCardSimple {...defaultProps} trip={trip} />);

      const viewDetailsBtn = screen.getByTestId('view-trip-details-btn');
      fireEvent.click(viewDetailsBtn);

      expect(mockPush).toHaveBeenCalledWith('/trips/42');
    });

    it('renders syncing indicator and disables interactive buttons when syncStatus is pending', () => {
      const trip: Trip = createMockTrip({
        id: -12345,
        name: 'Optimistic Pending Trip',
        syncStatus: 'pending',
      });

      render(<TripCardSimple {...defaultProps} trip={trip} />);

      expect(screen.getByText(/Syncing/i)).toBeInTheDocument();
      expect(screen.getByTestId('view-trip-details-btn')).toBeDisabled();
      expect(screen.getByTestId('share-trip-btn')).toBeDisabled();
      expect(screen.getByTestId('delete-trip-btn')).toBeDisabled();
      expect(screen.getByRole('button', { name: /Export to Google Maps/i })).toBeDisabled();
    });

    it('disables export button when trip has no wineries or wineries_count is 0', () => {
      const trip: Trip = createMockTrip({
        id: 50,
        wineries_count: 0,
        wineries: [],
      });
      render(<TripCardSimple {...defaultProps} trip={trip} />);

      const exportBtn = screen.getByRole('button', { name: /Export to Google Maps/i });
      expect(exportBtn).toBeDisabled();
    });

    it('invokes onShare when share button is clicked by owner', () => {
      const trip: Trip = createMockTrip({ id: 50, name: 'Shared Trip' });
      render(<TripCardSimple {...defaultProps} trip={trip} />);

      const shareBtn = screen.getByTestId('share-trip-btn');
      fireEvent.click(shareBtn);

      expect(mockOnShare).toHaveBeenCalledWith('50', 'Shared Trip');
    });

    it('invokes onDelete when delete button is clicked by owner', () => {
      const trip: Trip = createMockTrip({ id: 50, name: 'Trip To Delete' });
      render(<TripCardSimple {...defaultProps} trip={trip} />);

      const deleteBtn = screen.getByTestId('delete-trip-btn');
      fireEvent.click(deleteBtn);

      expect(mockDeleteTripAlert).not.toBeDefined?.();
      expect(mockOnDelete).toHaveBeenCalledWith(50);
    });

    it('invokes onExportToMaps when export button is clicked on trip with wineries', () => {
      const trip: Trip = createMockTrip({
        id: 50,
        wineries_count: 1,
        wineries: [mockWinery1],
      });
      render(<TripCardSimple {...defaultProps} trip={trip} />);

      const exportBtn = screen.getByRole('button', { name: /Export to Google Maps/i });
      expect(exportBtn).not.toBeDisabled();
      fireEvent.click(exportBtn);

      expect(mockOnExportToMaps).toHaveBeenCalledTimes(1);
    });
  });
});
