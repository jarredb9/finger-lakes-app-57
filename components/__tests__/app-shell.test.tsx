import { render, screen, fireEvent } from '@testing-library/react';
import { AppShell } from '../app-shell';
import { AuthenticatedUser } from '@/lib/types';
import { useLayoutTier } from '@/hooks/use-layout-tier';

// Mock dependencies
jest.mock('@/hooks/use-layout-tier', () => ({
  useLayoutTier: jest.fn(),
  DEFAULT_TABLET_BREAKPOINT: 768,
  DEFAULT_DESKTOP_BREAKPOINT: 1024,
  LAYOUT_BREAKPOINTS: { TABLET: 768, DESKTOP: 1024 },
}));

jest.mock('react-map-gl/mapbox', () => ({
  MapProvider: ({ children }: any) => <div data-testid="mock-map-provider">{children}</div>,
}));

jest.mock('@/components/winery-map-context', () => ({
  WineryMapProvider: ({ children }: any) => <div data-testid="mock-winery-map-provider">{children}</div>,
  useWineryMapContext: () => ({
    listResultsInView: [],
    isSearching: false,
    handleOpenModal: jest.fn(),
    hitApiLimit: false,
    searchLocation: '',
    setSearchLocation: jest.fn(),
    autoSearch: false,
    setAutoSearch: jest.fn(),
    handleSearchSubmit: jest.fn(),
    handleManualSearchArea: jest.fn(),
    filter: ['all'],
    handleFilterChange: jest.fn(),
    handlePlaceSelect: jest.fn(),
  }),
}));

jest.mock('@/components/WineryMap', () => {
  const MockWineryMap = ({ className }: any) => (
    <div data-testid="mock-winery-map" className={className}>
      Winery Map
    </div>
  );
  MockWineryMap.displayName = 'MockWineryMap';
  return MockWineryMap;
});

jest.mock('@/components/winery-modal', () => ({
  WineryModal: () => <div data-testid="mock-winery-modal">Winery Modal</div>,
}));
jest.mock('@/components/visit-history-modal', () => ({
  VisitHistoryModal: () => <div data-testid="mock-visit-history-modal">Visit History Modal</div>,
}));
jest.mock('@/components/offline-indicator', () => ({
  OfflineIndicator: () => <div data-testid="mock-offline-indicator">Offline Indicator</div>,
}));

jest.mock('@/components/app-sidebar', () => ({
  AppSidebar: () => <div data-testid="mock-app-sidebar">App Sidebar</div>,
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

const mockedUseLayoutTier = useLayoutTier as jest.MockedFunction<typeof useLayoutTier>;

describe('AppShell 3-Tier Responsive Layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders mobile layout components when tier is mobile', () => {
    mockedUseLayoutTier.mockReturnValue({
      tier: 'mobile',
      isMobile: true,
      isTablet: false,
      isDesktop: false,
      isTouch: true,
    });

    render(<AppShell user={mockUser} initialTab="trips" />);

    expect(screen.getByTestId('mobile-nav-bar')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-sidebar-container')).toBeInTheDocument();
    expect(screen.queryByTestId('tablet-floating-drawer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('desktop-sidebar-container')).not.toBeInTheDocument();
  });

  it('opens mobile bottom sheet on navigation bar tab click', () => {
    mockedUseLayoutTier.mockReturnValue({
      tier: 'mobile',
      isMobile: true,
      isTablet: false,
      isDesktop: false,
      isTouch: true,
    });

    render(<AppShell user={mockUser} initialTab="explore" />);

    expect(screen.getByTestId('mobile-nav-bar')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-sidebar-container')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mobile-nav-explore'));
    expect(screen.getByTestId('mobile-sidebar-container')).toBeInTheDocument();
  });

  it('renders tablet floating drawer when tier is tablet', () => {
    mockedUseLayoutTier.mockReturnValue({
      tier: 'tablet',
      isMobile: false,
      isTablet: true,
      isDesktop: false,
      isTouch: true,
    });

    render(<AppShell user={mockUser} />);

    expect(screen.getByTestId('tablet-floating-drawer')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-nav-bar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-sidebar-container')).not.toBeInTheDocument();
    expect(screen.queryByTestId('desktop-sidebar-container')).not.toBeInTheDocument();
  });

  it('renders desktop split-pane sidebar container when tier is desktop', () => {
    mockedUseLayoutTier.mockReturnValue({
      tier: 'desktop',
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      isTouch: false,
    });

    render(<AppShell user={mockUser} />);

    expect(screen.getByTestId('desktop-sidebar-container')).toBeInTheDocument();
    expect(screen.queryByTestId('tablet-floating-drawer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-nav-bar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-sidebar-container')).not.toBeInTheDocument();
  });
});
