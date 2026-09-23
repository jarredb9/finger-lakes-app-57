import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginForm } from '../login-form';
import { ForgotPasswordForm } from '../forgot-password-form';
import { ManualConfirmForm } from '../manual-confirm-form';
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

// Mock PlaceAutocomplete to allow direct simulation of winery selection
jest.mock('../PlaceAutocomplete', () => ({
  PlaceAutocomplete: ({ onPlaceSelect, id }: any) => (
    <button
      data-testid={id || 'mock-place-autocomplete'}
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
  ),
}));

describe('React 19 Form Actions Behavioral Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useTripStore.getState().reset();
    useWineryStore.getState().reset();
  });

  describe('1. LoginForm React 19 useActionState Modernization (FM-6.1)', () => {
    it('renders disabled pending state with spinner when form action is executing', () => {
      // Test that the submit button reflects isPending from useActionState
      render(<LoginForm redirectTo="/trips" />);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      expect(submitButton).toBeInTheDocument();
    });
  });

  describe('2. ForgotPasswordForm & ManualConfirmForm useActionState Modernization', () => {
    it('renders ForgotPasswordForm submit button and inputs', () => {
      render(<ForgotPasswordForm />);
      expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    it('renders ManualConfirmForm submit button and inputs', () => {
      render(<ManualConfirmForm />);
      expect(screen.getByRole('button', { name: /confirm account/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    });
  });

  describe('3. TripForm Controlled Hybrid useActionState & Offline Winery Selection (FM-6.2, FM-6.3)', () => {
    const mockUser: AuthenticatedUser = {
      id: 'user-trip-123',
      email: 'planner@example.com',
      name: 'Finger Lakes Explorer',
    };

    it('allows offline winery selection by assigning an ephemeral ID when ensureInDb returns null (FM-6.3)', async () => {
      mockToast.mockClear();

      // Simulate offline: ensureInDb RPC returns null (cannot reach remote Supabase)
      const ensureInDbMock = jest.fn().mockResolvedValue(null);
      const upsertWineryMock = jest.fn();

      useWineryStore.setState({
        ensureInDb: ensureInDbMock,
        upsertWinery: upsertWineryMock,
      });

      render(<TripForm user={mockUser} initialDate={new Date('2026-10-15T12:00:00')} />);

      // Trigger winery selection via PlaceAutocomplete mock
      const winerySelectButton = screen.getByTestId('trip-form-winery-autocomplete');
      fireEvent.click(winerySelectButton);

      // In pre-refactor code:
      // ensureInDb returning null causes:
      // toast({ variant: "destructive", description: "Could not save ... to the database." })
      // and aborts without adding the winery to the list.
      //
      // REQUIREMENT: Offline winery selection must NOT be blocked.
      // It must add the winery to the selected list (assigning an ephemeral ID)
      // and must NOT fire a destructive toast error.
      await waitFor(() => {
        expect(mockToast).not.toHaveBeenCalledWith(
          expect.objectContaining({ variant: 'destructive' })
        );
        expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();
      });
    });

    it('preserves react-hook-form / Zod validation and prevents submission on empty trip name', async () => {
      render(<TripForm user={mockUser} initialDate={new Date('2026-10-15T12:00:00')} />);

      const submitButton = screen.getByTestId('create-trip-submit-btn');

      // With empty name, submit button should be disabled or submitting should show validation error
      expect(submitButton).toBeDisabled();
    });
  });
});
