import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TripShareDialog } from '../TripShareDialog';
import { useFriendStore } from '@/lib/stores/friendStore';
import { TripService } from '@/lib/services/tripService';
import { useToast } from '@/hooks/use-toast';

// Mock the friend store
jest.mock('@/lib/stores/friendStore', () => ({
  useFriendStore: jest.fn(),
}));

// Mock the TripService
jest.mock('@/lib/services/tripService', () => ({
  TripService: {
    addMemberByEmail: jest.fn(),
  },
}));

// Mock useToast
jest.mock('@/hooks/use-toast', () => ({
  useToast: jest.fn(),
}));

describe('TripShareDialog', () => {
  const mockFriends = [
    { id: '1', name: 'Friend One', email: 'one@example.com' },
    { id: '2', name: 'Friend Two', email: 'two@example.com' },
  ];

  const mockToast = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useFriendStore as unknown as jest.Mock).mockReturnValue({
      friends: mockFriends,
      isLoading: false,
      fetchFriends: jest.fn(),
    });
    (useToast as unknown as jest.Mock).mockReturnValue({
      toast: mockToast,
    });
  });

  it('renders the dialog title', () => {
    render(
      <TripShareDialog 
        isOpen={true} 
        onClose={() => {}} 
        tripName="Test Trip" 
        tripId="123"
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
        tripId="123"
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
        tripId="123"
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
        tripId="123"
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
        tripId="123"
      />
    );
    
    expect(screen.getByPlaceholderText(/Enter email address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Invite by Email/i })).toBeInTheDocument();
  });

  it('calls TripService.addMemberByEmail when clicking invite button', async () => {
    (TripService.addMemberByEmail as jest.Mock).mockResolvedValue({ success: true });
    
    render(
      <TripShareDialog 
        isOpen={true} 
        onClose={() => {}} 
        tripName="Test Trip" 
        tripId="123"
      />
    );
    
    const input = screen.getByPlaceholderText(/Enter email address/i);
    const button = screen.getByRole('button', { name: /Invite by Email/i });
    
    fireEvent.change(input, { target: { value: 'test@example.com' } });
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(TripService.addMemberByEmail).toHaveBeenCalledWith(123, 'test@example.com');
    });
    
    expect(mockToast).toHaveBeenCalledWith({
      description: "Invitation sent to test@example.com",
    });
  });

  it('calls TripService.addMemberByEmail when clicking invite button for a friend', async () => {
    (TripService.addMemberByEmail as jest.Mock).mockResolvedValue({ success: true });
    
    render(
      <TripShareDialog 
        isOpen={true} 
        onClose={() => {}} 
        tripName="Test Trip" 
        tripId="123"
      />
    );
    
    const inviteButtons = screen.getAllByRole('button', { name: /Invite/i });
    fireEvent.click(inviteButtons[0]); // First friend "Invite" button
    
    await waitFor(() => {
      expect(TripService.addMemberByEmail).toHaveBeenCalledWith(123, 'one@example.com');
    });
    
    expect(mockToast).toHaveBeenCalledWith({
      description: "Invitation sent to one@example.com",
    });
  });

  it('shows error toast when invitation fails', async () => {
    const errorMessage = "User already in trip";
    (TripService.addMemberByEmail as jest.Mock).mockRejectedValue(new Error(errorMessage));
    
    render(
      <TripShareDialog 
        isOpen={true} 
        onClose={() => {}} 
        tripName="Test Trip" 
        tripId="123"
      />
    );
    
    const input = screen.getByPlaceholderText(/Enter email address/i);
    const button = screen.getByRole('button', { name: /Invite by Email/i });
    
    fireEvent.change(input, { target: { value: 'test@example.com' } });
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        variant: "destructive",
        title: "Invitation Failed",
        description: errorMessage,
      });
    });
  });
});
