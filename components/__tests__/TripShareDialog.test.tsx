import { render, screen, fireEvent } from '@testing-library/react';
import { TripShareDialog } from '../TripShareDialog';
import { useFriendStore } from '@/lib/stores/friendStore';

// Mock the friend store
jest.mock('@/lib/stores/friendStore', () => ({
  useFriendStore: jest.fn(),
}));

describe('TripShareDialog', () => {
  const mockFriends = [
    { id: '1', name: 'Friend One', email: 'one@example.com' },
    { id: '2', name: 'Friend Two', email: 'two@example.com' },
  ];

  beforeEach(() => {
    (useFriendStore as unknown as jest.Mock).mockReturnValue({
      friends: mockFriends,
      isLoading: false,
      fetchFriends: jest.fn(),
    });
  });

  it('renders the dialog title', () => {
    render(
      <TripShareDialog 
        isOpen={true} 
        onClose={() => {}} 
        tripName="Test Trip" 
        tripId="test-trip-id"
      />
    );
    
    expect(screen.getByText(/Share "Test Trip"/i)).toBeInTheDocument();
  });

  it('displays the list of friends', () => {
    render(
      <TripShareDialog 
        isOpen={true} 
        onClose={() => {}} 
        tripName="Test Trip" 
        tripId="test-trip-id"
      />
    );
    
    expect(screen.getByText('Friend One')).toBeInTheDocument();
    expect(screen.getByText('Friend Two')).toBeInTheDocument();
  });

  it('displays loading state', () => {
    (useFriendStore as unknown as jest.Mock).mockReturnValue({
      friends: [],
      isLoading: true,
      fetchFriends: jest.fn(),
    });

    render(
      <TripShareDialog 
        isOpen={true} 
        onClose={() => {}} 
        tripName="Test Trip" 
        tripId="test-trip-id"
      />
    );
    
    expect(screen.getByTestId('loading-friends')).toBeInTheDocument();
  });

  it('displays empty state', () => {
    (useFriendStore as unknown as jest.Mock).mockReturnValue({
      friends: [],
      isLoading: false,
      fetchFriends: jest.fn(),
    });

    render(
      <TripShareDialog 
        isOpen={true} 
        onClose={() => {}} 
        tripName="Test Trip" 
        tripId="test-trip-id"
      />
    );
    
    expect(screen.getByText(/No friends found./i)).toBeInTheDocument();
  });

  it('renders the email invitation input', () => {
    render(
      <TripShareDialog 
        isOpen={true} 
        onClose={() => {}} 
        tripName="Test Trip" 
        tripId="test-trip-id"
      />
    );
    
    expect(screen.getByPlaceholderText(/Enter email address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Invite by Email/i })).toBeInTheDocument();
  });

  it('calls console.log when clicking invite button', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    render(
      <TripShareDialog 
        isOpen={true} 
        onClose={() => {}} 
        tripName="Test Trip" 
        tripId="test-trip-id"
      />
    );
    
    const input = screen.getByPlaceholderText(/Enter email address/i);
    const button = screen.getByRole('button', { name: /Invite by Email/i });
    
    fireEvent.change(input, { target: { value: 'test@example.com' } });
    fireEvent.click(button);
    
    expect(consoleSpy).toHaveBeenCalledWith('Inviting test@example.com to trip test-trip-id');
    consoleSpy.mockRestore();
  });
});
