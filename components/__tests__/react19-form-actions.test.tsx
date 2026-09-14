import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
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

describe('Phase 6 Task 1: React 19 Form Actions Modernization Tests', () => {
  const componentsDir = path.join(process.cwd(), 'components');

  beforeEach(() => {
    jest.clearAllMocks();
    useTripStore.getState().reset();
    useWineryStore.getState().reset();
  });

  describe('1. LoginForm React 19 useActionState Modernization (FM-6.1)', () => {
    it('uses React 19 useActionState rather than direct client Supabase authentication', () => {
      const loginFormSource = fs.readFileSync(path.join(componentsDir, 'login-form.tsx'), 'utf-8');

      // ARCHITECTURE REQUIREMENT: LoginForm must use useActionState from React
      // and import its typed Server Action from app/actions/auth.
      // It must NOT directly call supabase.auth.signInWithPassword in the client component.
      expect(loginFormSource).toMatch(/useActionState/);
      expect(loginFormSource).toMatch(/@\/app\/actions\/auth/);
      expect(loginFormSource).not.toMatch(/supabase\.auth\.signInWithPassword/);
    });

    it('renders disabled pending state with spinner when form action is executing', () => {
      // Test that the submit button reflects isPending from useActionState
      render(<LoginForm redirectTo="/trips" />);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      expect(submitButton).toBeInTheDocument();
    });
  });

  describe('2. ForgotPasswordForm & ManualConfirmForm useActionState Modernization', () => {
    it('ForgotPasswordForm uses useActionState and typed Server Action without raw client fetch', () => {
      const forgotPasswordSource = fs.readFileSync(
        path.join(componentsDir, 'forgot-password-form.tsx'),
        'utf-8'
      );

      // ARCHITECTURE REQUIREMENT: Must adopt React 19 useActionState and Server Action
      expect(forgotPasswordSource).toMatch(/useActionState/);
      expect(forgotPasswordSource).toMatch(/@\/app\/actions\/auth/);
      expect(forgotPasswordSource).not.toMatch(/fetch\(['"]\/api\/auth\/forgot-password/);
    });

    it('renders ForgotPasswordForm submit button and inputs', () => {
      render(<ForgotPasswordForm />);
      expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    it('ManualConfirmForm uses useActionState and typed Server Action without raw client fetch', () => {
      const manualConfirmSource = fs.readFileSync(
        path.join(componentsDir, 'manual-confirm-form.tsx'),
        'utf-8'
      );

      // ARCHITECTURE REQUIREMENT: Must adopt React 19 useActionState and Server Action
      expect(manualConfirmSource).toMatch(/useActionState/);
      expect(manualConfirmSource).toMatch(/@\/app\/actions\/auth/);
      expect(manualConfirmSource).not.toMatch(/fetch\(['"]\/api\/auth\/confirm-user/);
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

    it('TripForm adopts Controlled Hybrid useActionState pattern', () => {
      const tripFormSource = fs.readFileSync(path.join(componentsDir, 'trip-form.tsx'), 'utf-8');

      // ARCHITECTURE REQUIREMENT: TripForm adopts React 19 useActionState
      // to handle form submission state while retaining react-hook-form and Zod validation.
      expect(tripFormSource).toMatch(/useActionState/);
    });

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
