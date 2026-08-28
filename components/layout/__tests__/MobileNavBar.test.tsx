import { render, screen, fireEvent } from '@testing-library/react';
import { MobileNavBar } from '../MobileNavBar';
import { useFriendStore } from '@/lib/stores/friendStore';

// Mock friendStore
jest.mock('@/lib/stores/friendStore', () => ({
  useFriendStore: jest.fn(),
}));

const mockUseFriendStore = useFriendStore as unknown as jest.Mock;

describe('MobileNavBar Component', () => {
  const mockOnTabSelect = jest.fn();
  const mockOnMapSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFriendStore.mockImplementation((selector?: any) => {
      const state = { friendRequests: [] };
      return selector ? selector(state) : state;
    });
  });

  it('renders all 5 navigation buttons with proper test IDs and labels', () => {
    render(
      <MobileNavBar
        activeTab="explore"
        isMobileSheetOpen={false}
        onTabSelect={mockOnTabSelect}
        onMapSelect={mockOnMapSelect}
      />
    );

    expect(screen.getByTestId('mobile-nav-bar')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-nav-map')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-nav-explore')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-nav-trips')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-nav-friends')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-nav-history')).toBeInTheDocument();

    expect(screen.getByText('Map')).toBeInTheDocument();
    expect(screen.getByText('Explore')).toBeInTheDocument();
    expect(screen.getByText('Trips')).toBeInTheDocument();
    expect(screen.getByText('Friends')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
  });

  describe('Active state styling', () => {
    it('highlights Map button when sheet is closed', () => {
      render(
        <MobileNavBar
          activeTab="explore"
          isMobileSheetOpen={false}
          onTabSelect={mockOnTabSelect}
          onMapSelect={mockOnMapSelect}
        />
      );

      const mapBtn = screen.getByTestId('mobile-nav-map');
      const exploreBtn = screen.getByTestId('mobile-nav-explore');

      expect(mapBtn.className).toContain('bg-primary/10');
      expect(mapBtn.className).toContain('text-primary');
      expect(exploreBtn.className).toContain('text-muted-foreground');
    });

    it('highlights Explore button when activeTab is explore and sheet is open', () => {
      render(
        <MobileNavBar
          activeTab="explore"
          isMobileSheetOpen={true}
          onTabSelect={mockOnTabSelect}
          onMapSelect={mockOnMapSelect}
        />
      );

      const mapBtn = screen.getByTestId('mobile-nav-map');
      const exploreBtn = screen.getByTestId('mobile-nav-explore');

      expect(mapBtn.className).toContain('text-muted-foreground');
      expect(exploreBtn.className).toContain('bg-primary/10');
      expect(exploreBtn.className).toContain('text-primary');
    });

    it('highlights Trips button when activeTab is trips and sheet is open', () => {
      render(
        <MobileNavBar
          activeTab="trips"
          isMobileSheetOpen={true}
          onTabSelect={mockOnTabSelect}
          onMapSelect={mockOnMapSelect}
        />
      );

      const tripsBtn = screen.getByTestId('mobile-nav-trips');
      expect(tripsBtn.className).toContain('bg-primary/10');
      expect(tripsBtn.className).toContain('text-primary');
    });

    it('highlights Friends button when activeTab is friends and sheet is open', () => {
      render(
        <MobileNavBar
          activeTab="friends"
          isMobileSheetOpen={true}
          onTabSelect={mockOnTabSelect}
          onMapSelect={mockOnMapSelect}
        />
      );

      const friendsBtn = screen.getByTestId('mobile-nav-friends');
      expect(friendsBtn.className).toContain('bg-primary/10');
      expect(friendsBtn.className).toContain('text-primary');
    });

    it('highlights History button when activeTab is history and sheet is open', () => {
      render(
        <MobileNavBar
          activeTab="history"
          isMobileSheetOpen={true}
          onTabSelect={mockOnTabSelect}
          onMapSelect={mockOnMapSelect}
        />
      );

      const historyBtn = screen.getByTestId('mobile-nav-history');
      expect(historyBtn.className).toContain('bg-primary/10');
      expect(historyBtn.className).toContain('text-primary');
    });
  });

  describe('User Interactions', () => {
    it('calls onMapSelect when Map button is clicked', () => {
      render(
        <MobileNavBar
          activeTab="explore"
          isMobileSheetOpen={true}
          onTabSelect={mockOnTabSelect}
          onMapSelect={mockOnMapSelect}
        />
      );

      fireEvent.click(screen.getByTestId('mobile-nav-map'));
      expect(mockOnMapSelect).toHaveBeenCalledTimes(1);
    });

    it('calls onTabSelect with "explore" when Explore button is clicked', () => {
      render(
        <MobileNavBar
          activeTab="trips"
          isMobileSheetOpen={true}
          onTabSelect={mockOnTabSelect}
          onMapSelect={mockOnMapSelect}
        />
      );

      fireEvent.click(screen.getByTestId('mobile-nav-explore'));
      expect(mockOnTabSelect).toHaveBeenCalledWith('explore');
    });

    it('calls onTabSelect with "trips" when Trips button is clicked', () => {
      render(
        <MobileNavBar
          activeTab="explore"
          isMobileSheetOpen={false}
          onTabSelect={mockOnTabSelect}
          onMapSelect={mockOnMapSelect}
        />
      );

      fireEvent.click(screen.getByTestId('mobile-nav-trips'));
      expect(mockOnTabSelect).toHaveBeenCalledWith('trips');
    });

    it('calls onTabSelect with "friends" when Friends button is clicked', () => {
      render(
        <MobileNavBar
          activeTab="explore"
          isMobileSheetOpen={false}
          onTabSelect={mockOnTabSelect}
          onMapSelect={mockOnMapSelect}
        />
      );

      fireEvent.click(screen.getByTestId('mobile-nav-friends'));
      expect(mockOnTabSelect).toHaveBeenCalledWith('friends');
    });

    it('calls onTabSelect with "history" when History button is clicked', () => {
      render(
        <MobileNavBar
          activeTab="explore"
          isMobileSheetOpen={false}
          onTabSelect={mockOnTabSelect}
          onMapSelect={mockOnMapSelect}
        />
      );

      fireEvent.click(screen.getByTestId('mobile-nav-history'));
      expect(mockOnTabSelect).toHaveBeenCalledWith('history');
    });
  });

  describe('Friend Requests Badge', () => {
    it('does not display badge when friendRequests is empty', () => {
      mockUseFriendStore.mockImplementation((selector?: any) => {
        const state = { friendRequests: [] };
        return selector ? selector(state) : state;
      });

      render(
        <MobileNavBar
          activeTab="explore"
          isMobileSheetOpen={false}
          onTabSelect={mockOnTabSelect}
          onMapSelect={mockOnMapSelect}
        />
      );

      expect(screen.queryByTestId('mobile-nav-friends-badge')).not.toBeInTheDocument();
    });

    it('displays badge with request count when incoming friend requests exist', () => {
      mockUseFriendStore.mockImplementation((selector?: any) => {
        const state = {
          friendRequests: [
            { id: '1', name: 'Alice' },
            { id: '2', name: 'Bob' },
            { id: '3', name: 'Charlie' },
          ],
        };
        return selector ? selector(state) : state;
      });

      render(
        <MobileNavBar
          activeTab="explore"
          isMobileSheetOpen={false}
          onTabSelect={mockOnTabSelect}
          onMapSelect={mockOnMapSelect}
        />
      );

      const badge = screen.getByTestId('mobile-nav-friends-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('3');
    });
  });

  describe('Custom ClassName Merging', () => {
    it('applies custom className to container', () => {
      render(
        <MobileNavBar
          activeTab="explore"
          isMobileSheetOpen={false}
          onTabSelect={mockOnTabSelect}
          onMapSelect={mockOnMapSelect}
          className="custom-nav-class"
        />
      );

      const container = screen.getByTestId('mobile-nav-bar');
      expect(container.className).toContain('custom-nav-class');
    });
  });
});
