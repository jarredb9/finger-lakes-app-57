import { render, screen } from '@testing-library/react';
import TripPlanner from '../trip-planner';
import { AuthenticatedUser } from '@/lib/types';

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // Deprecated
    removeListener: jest.fn(), // Deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock the dependencies
jest.mock('@/lib/stores/tripStore', () => ({
  useTripStore: () => ({
    tripsForDate: [{ 
      id: 1, 
      name: 'Test Trip', 
      trip_date: '2026-03-05', 
      user_id: 'user-1', 
      wineries: [], 
      members: [
        { id: 'user-1', name: 'Test User', email: 'user@example.com', role: 'owner', status: 'joined' }
      ] 
    }],
    isLoading: false,
    fetchTripsForDate: jest.fn(),
  }),
}));

// Mock UI components simply but functionally
jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => children,
  TooltipTrigger: ({ children }: any) => children,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
  TooltipProvider: ({ children }: any) => children,
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: any) => <div>{children}</div>,
  DialogTrigger: ({ children }: any) => children,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/button', () => {
  const Button = ({ children, onClick, disabled, className, variant, size, ...props }: any) => (
    <button 
      onClick={onClick} 
      disabled={disabled} 
      className={className} 
      data-variant={variant}
      data-size={size}
      {...props}
    >
      {children}
    </button>
  );
  Button.displayName = 'Button';
  return { 
    Button,
    buttonVariants: jest.fn(() => "") 
  };
});

describe('TripPlanner', () => {
  const mockUser: AuthenticatedUser = {
    id: 'user-1',
    email: 'user@example.com',
    name: 'Test User',
  };

  it('renders the share button in header', () => {
    render(<TripPlanner initialDate={new Date()} user={mockUser} />);
    expect(screen.getByRole('button', { name: /share day/i })).toBeInTheDocument();
  });
});
