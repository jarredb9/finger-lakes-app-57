import { render, screen } from '@testing-library/react';
import TripPlanner from '../trip-planner';
import { AuthenticatedUser } from '@/lib/types';

// Mock the dependencies
jest.mock('@/lib/stores/tripStore', () => ({
  useTripStore: () => ({
    tripsForDate: [{ id: 1, name: 'Test Trip', trip_date: '2026-03-05', user_id: 'user-1', wineries: [], members: ['user-1'] }],
    isLoading: false,
    fetchTripsForDate: jest.fn(),
  }),
}));

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
