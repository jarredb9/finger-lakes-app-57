import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TripForm from '../trip-form';
import { useTripStore } from '@/lib/stores/tripStore';
import { useWineryStore } from '@/lib/stores/wineryStore';
import { AuthenticatedUser } from '@/lib/types';

const mockPush = jest.fn();
const mockRefresh = jest.fn();
const mockToast = jest.fn();

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
    toasts: [],
    dismiss: jest.fn(),
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

// Mock PlaceAutocomplete to allow multi-winery selection simulation
jest.mock('../PlaceAutocomplete', () => ({
  PlaceAutocomplete: ({ onPlaceSelect }: any) => (
    <div data-testid="mock-place-autocomplete-container">
      <button
        data-testid="trip-form-winery-autocomplete"
        type="button"
        onClick={() =>
          onPlaceSelect({
            id: 'google-place-winery-123',
            name: 'Keuka Spring Vineyards',
            address: '243 Route 54, Penn Yan, NY',
            location: { latitude: 42.63, longitude: -77.12 },
          })
        }
      >
        Select Keuka Spring Vineyards
      </button>
      <button
        data-testid="mock-select-winery-2"
        type="button"
        onClick={() =>
          onPlaceSelect({
            id: 'google-place-winery-456',
            name: 'Dr. Konstantin Frank',
            address: '9749 Middle Rd, Hammondsport, NY',
            location: { latitude: 42.55, longitude: -77.18 },
          })
        }
      >
        Select Dr. Konstantin Frank
      </button>
    </div>
  ),
}));

describe('TripForm Controlled FormField & Multi-Stop Binding', () => {
  const mockUser: AuthenticatedUser = {
    id: 'user-trip-123',
    email: 'planner@example.com',
    name: 'Finger Lakes Explorer',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useTripStore.getState().reset();
    useWineryStore.getState().reset();
  });

  describe('Validation & Baseline Invariants', () => {
    it('preserves react-hook-form / Zod validation and prevents submission on empty trip name', async () => {
      render(<TripForm user={mockUser} initialDate={new Date('2026-10-15T12:00:00')} />);

      const submitButton = screen.getByTestId('create-trip-submit-btn');
      expect(submitButton).toBeDisabled();
    });

    it('allows offline winery selection without throwing errors or blocking selection (FM-6.3)', async () => {
      mockToast.mockClear();

      const ensureInDbMock = jest.fn().mockResolvedValue(null);
      const upsertWineryMock = jest.fn();

      useWineryStore.setState({
        ensureInDb: ensureInDbMock,
        upsertWinery: upsertWineryMock,
      });

      render(<TripForm user={mockUser} initialDate={new Date('2026-10-15T12:00:00')} />);

      const winerySelectButton = screen.getByTestId('trip-form-winery-autocomplete');
      fireEvent.click(winerySelectButton);

      await waitFor(() => {
        expect(mockToast).not.toHaveBeenCalledWith(
          expect.objectContaining({ variant: 'destructive' })
        );
        expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();
      });
    });
  });

  describe('Controlled FormField Binding & Deduplication (Red Phase Assertions)', () => {
    it('updates form state synchronously via controlled field without invoking legacy ensureInDb on place select', async () => {
      const ensureInDbMock = jest.fn();
      useWineryStore.setState({ ensureInDb: ensureInDbMock });

      render(<TripForm user={mockUser} initialDate={new Date('2026-10-15T12:00:00')} />);

      const winerySelectButton = screen.getByTestId('trip-form-winery-autocomplete');
      fireEvent.click(winerySelectButton);

      expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();
      // RED PHASE CHECK: In current TripForm, handleWineryToggle calls ensureInDb(winery.id).
      // Controlled FormField binding must NOT call ensureInDb on place selection.
      expect(ensureInDbMock).not.toHaveBeenCalled();
    });

    it('deduplicates winery selection when the same winery is selected multiple times from autocomplete', async () => {
      render(<TripForm user={mockUser} initialDate={new Date('2026-10-15T12:00:00')} />);

      const winerySelectButton = screen.getByTestId('trip-form-winery-autocomplete');

      // First click: adds winery
      fireEvent.click(winerySelectButton);
      expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();

      // Second click: autocomplete selection must deduplicate, NOT toggle off
      fireEvent.click(winerySelectButton);

      // RED PHASE CHECK: In current TripForm, handleWineryToggle toggles the winery off on second click.
      // Target FormField binding deduplicates and keeps the tag in the list.
      expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();
      const selectedTags = screen.getAllByTestId('selected-winery-google-place-winery-123');
      expect(selectedTags).toHaveLength(1);
    });

    it('removes selected winery tag when the remove button is clicked and preserves other selected wineries', async () => {
      render(<TripForm user={mockUser} initialDate={new Date('2026-10-15T12:00:00')} />);

      // Select winery 1 and winery 2
      fireEvent.click(screen.getByTestId('trip-form-winery-autocomplete'));
      fireEvent.click(screen.getByTestId('mock-select-winery-2'));

      expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();
      expect(screen.getByTestId('selected-winery-google-place-winery-456')).toBeInTheDocument();

      // Click remove on winery 1 badge
      const removeButton = screen.getByRole('button', { name: /remove keuka spring vineyards/i });
      fireEvent.click(removeButton);

      expect(screen.queryByTestId('selected-winery-google-place-winery-123')).not.toBeInTheDocument();
      expect(screen.getByTestId('selected-winery-google-place-winery-456')).toBeInTheDocument();
    });

    it('submits form with trip name, local date, and selected wineries payload to createTrip', async () => {
      const createTripMock = jest.fn().mockResolvedValue({ id: 101, name: 'Keuka Lake Tour' });
      useTripStore.setState({ createTrip: createTripMock });
      const mockOnClose = jest.fn();

      render(
        <TripForm
          user={mockUser}
          initialDate={new Date('2026-10-15T12:00:00')}
          onClose={mockOnClose}
        />
      );

      // Fill trip name
      const nameInput = screen.getByTestId('trip-name-input');
      fireEvent.change(nameInput, { target: { value: 'Keuka Lake Tour' } });

      // Add winery 1 and winery 2, then remove winery 1
      fireEvent.click(screen.getByTestId('trip-form-winery-autocomplete'));
      fireEvent.click(screen.getByTestId('mock-select-winery-2'));

      const removeButton = screen.getByRole('button', { name: /remove keuka spring vineyards/i });
      fireEvent.click(removeButton);

      // Verify submit button is enabled
      const submitButton = screen.getByTestId('create-trip-submit-btn');
      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });

      // Submit form
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(createTripMock).toHaveBeenCalledTimes(1);
        expect(createTripMock).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Keuka Lake Tour',
            trip_date: '2026-10-15',
            user_id: 'user-trip-123',
            wineries: [
              expect.objectContaining({
                id: 'google-place-winery-456',
                name: 'Dr. Konstantin Frank',
              }),
            ],
          })
        );
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Trip created successfully!' })
      );
      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});
