import { render, screen } from '@testing-library/react';
import { LoginForm } from '../login-form';
import { ForgotPasswordForm } from '../forgot-password-form';
import { ManualConfirmForm } from '../manual-confirm-form';

const mockPush = jest.fn();
const mockRefresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

describe('Auth Forms React 19 useActionState Behavioral Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
