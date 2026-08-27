import { render, screen, fireEvent } from '@testing-library/react';
import { AppSidebar } from '../app-sidebar';
import { AuthenticatedUser } from '@/lib/types';
import { useUIStore } from '@/lib/stores/uiStore';
import { useFriendStore } from '@/lib/stores/friendStore';

// Mock subcomponents and contexts
jest.mock('@/components/winery-map-context', () => ({
  useWineryMapContext: () => ({
    listResultsInView: [],
    isSearching: false,
    handleOpenModal: jest.fn(),
  }),
}));

jest.mock('@/components/map/map-controls', () => ({
  MapControls: () => <div data-testid="mock-map-controls">Map Controls</div>,
}));

jest.mock('@/components/map/WinerySearchResults', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-winery-search-results">Search Results</div>,
}));

jest.mock('@/components/trip-list', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-trip-list">Trip List</div>,
}));

jest.mock('@/components/friends-manager', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-friends-manager">Friends Manager</div>,
}));

jest.mock('@/components/global-visit-history', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-global-visit-history">Visit History</div>,
}));

jest.mock('@/hooks/use-pwa', () => ({
  usePwa: () => ({
    isInstallable: false,
    isStandalone: false,
    installApp: jest.fn(),
    isUpdateAvailable: false,
    updateApp: jest.fn(),
  }),
}));

const mockUser: AuthenticatedUser = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Wine Explorer',
};

describe('AppSidebar Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useUIStore.setState({ isHydrated: true });
    useFriendStore.setState({ friendRequests: [] });
  });

  it('renders sidebar branding, tabs, and default Explore tab content', () => {
    render(<AppSidebar user={mockUser} activeTab="explore" />);

    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
    expect(screen.getByText('Winery Tracker')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /explore/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /trips/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /friends/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /history/i })).toBeInTheDocument();

    expect(screen.getByTestId('mock-map-controls')).toBeInTheDocument();
    expect(screen.getByText('Wineries in View')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /map legend/i })).toBeInTheDocument();
    expect(screen.getByTestId('mock-winery-search-results')).toBeInTheDocument();
  });

  it('renders and opens MapLegendPopover to display map symbology', () => {
    render(<AppSidebar user={mockUser} activeTab="explore" />);

    const legendTrigger = screen.getByRole('button', { name: /map legend/i });
    expect(legendTrigger).toBeInTheDocument();

    fireEvent.click(legendTrigger);
    expect(screen.getByText('Map Legend')).toBeInTheDocument();
    expect(screen.getByText('Trip Stop')).toBeInTheDocument();
    expect(screen.getByText('Favorite')).toBeInTheDocument();
    expect(screen.getByText('Want to Go')).toBeInTheDocument();
    expect(screen.getByText('Visited')).toBeInTheDocument();
    expect(screen.getByText('Discovered')).toBeInTheDocument();
  });

  it('handles tab change callbacks when user selects another tab', () => {
    const onTabChange = jest.fn();
    render(<AppSidebar user={mockUser} activeTab="explore" onTabChange={onTabChange} />);

    const tripsTab = screen.getByRole('tab', { name: /trips/i });
    fireEvent.mouseDown(tripsTab, { button: 0, ctrlKey: false });
    expect(onTabChange).toHaveBeenCalledWith('trips');
  });

  it('displays badge when friend requests are present', () => {
    useFriendStore.setState({
      friendRequests: [
        { id: '1', sender_id: 'u2', receiver_id: 'user-123', status: 'pending', created_at: '' } as any,
      ],
    });

    render(<AppSidebar user={mockUser} activeTab="explore" />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
