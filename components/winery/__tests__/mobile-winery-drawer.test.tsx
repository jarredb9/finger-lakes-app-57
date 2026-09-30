import { render, screen, fireEvent } from '@testing-library/react';
import { MobileWineryDrawer } from '../mobile-winery-drawer';
import { createMockWinery, createMockVisit } from '@/lib/test-utils/fixtures';

// Mock subcomponents
jest.mock('../hero-photo-carousel', () => ({
  HeroPhotoCarousel: ({ winery, onPhotoClick }: any) => (
    <div data-testid="mock-hero-carousel" onClick={() => onPhotoClick?.('photo-1')}>
      {winery.name}
    </div>
  ),
  __esModule: true,
  default: ({ winery, onPhotoClick }: any) => (
    <div data-testid="mock-hero-carousel" onClick={() => onPhotoClick?.('photo-1')}>
      {winery.name}
    </div>
  ),
}));

jest.mock('../photo-lightbox-modal', () => ({
  PhotoLightboxModal: ({ photoRef }: any) => (
    photoRef ? <div data-testid="mock-lightbox">{photoRef}</div> : null
  ),
  __esModule: true,
  default: ({ photoRef }: any) => (
    photoRef ? <div data-testid="mock-lightbox">{photoRef}</div> : null
  ),
}));

jest.mock('../../WineryDetails', () => ({
  WineryDetails: ({ mode }: any) => <div data-testid={`mock-winery-details-${mode}`} />,
}));

jest.mock('../../WineryActionsPresentational', () => ({
  WineryActionsPresentational: () => <div data-testid="mock-winery-actions" />,
}));

jest.mock('../../WineryCommunityTab', () => ({
  WineryCommunityTab: () => <div data-testid="mock-community-tab" />,
}));

jest.mock('../../WineryVarietalsTab', () => ({
  WineryVarietalsTab: () => <div data-testid="mock-varietals-tab" />,
}));

jest.mock('../../WineryWeatherWidget', () => ({
  WineryWeatherWidget: () => <div data-testid="mock-weather-widget" />,
}));

jest.mock('../../TripPlannerSection', () => ({
  TripPlannerSection: () => <div data-testid="mock-trip-planner" />,
  __esModule: true,
  default: () => <div data-testid="mock-trip-planner" />,
}));

jest.mock('../../VisitCardHistory', () => ({
  VisitCardHistory: () => <div data-testid="mock-visit-history" />,
  __esModule: true,
  default: () => <div data-testid="mock-visit-history" />,
}));

jest.mock('../../MapNavigation', () => ({
  MapNavigation: ({ children }: any) => <div data-testid="mock-map-nav">{children}</div>,
}));

describe('MobileWineryDrawer', () => {
  const mockWinery = createMockWinery({
    id: 'winery-1' as any,
    name: 'Dr. Konstantin Frank',
    address: '9749 Middle Rd',
    rating: 4.9,
    latitude: 42.5,
    longitude: -77.1,
    trip_id: 456,
    trip_name: 'Keuka Lake Tour',
    trip_date: '2026-08-25',
    openingHours: {
      open_now: true,
      weekday_text: ['Monday: 10:00 AM – 5:00 PM'],
    },
  });

  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    winery: mockWinery,
    loadingWineryId: null,
    isLoading: false,
    isAIEnabled: true,
    isMobile: true,
    lightboxPhoto: null,
    setLightboxPhoto: jest.fn(),
    snapPoint: '520px',
    setSnapPoint: jest.fn(),
    activeTab: 'community' as const,
    effectiveActiveTab: 'community' as const,
    setActiveTab: jest.fn(),
    visits: [createMockVisit({ id: 'v1', visit_date: '2026-05-01' })],
    scrollContainerRef: { current: null },
    visitHistoryRef: { current: null },
    onLogVisit: jest.fn(),
    onStreetView: jest.fn(),
    onToggleWishlist: jest.fn(),
    onToggleFavorite: jest.fn(),
    onToggleFavoritePrivacy: jest.fn(),
    onToggleWishlistPrivacy: jest.fn(),
    onEditVisit: jest.fn(),
    onDeleteVisit: jest.fn(),
    onTripBadgeClick: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading skeleton when isLoading is true', () => {
    render(<MobileWineryDrawer {...defaultProps} isLoading={true} />);

    const drawer = screen.getByTestId('winery-modal-drawer');
    expect(drawer).toHaveAttribute('data-state', 'loading');
    expect(drawer).toHaveAttribute('data-snap-points', '300px,520px,1');
  });

  it('renders winery drawer content when ready', () => {
    render(<MobileWineryDrawer {...defaultProps} />);

    const drawer = screen.getByTestId('winery-modal-drawer');
    expect(drawer).toHaveAttribute('data-state', 'ready');
    expect(screen.getAllByText('Dr. Konstantin Frank').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('9749 Middle Rd')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-title-card')).toBeInTheDocument();
    expect(screen.getByTestId('mock-winery-actions')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-expand-chevron-button')).toBeInTheDocument();
  });

  it('handles snapPoint cycling on title card click', () => {
    render(<MobileWineryDrawer {...defaultProps} snapPoint="300px" />);

    const titleCard = screen.getByTestId('drawer-title-card');
    fireEvent.click(titleCard);
    expect(defaultProps.setSnapPoint).toHaveBeenCalledWith('520px');
  });

  it('renders full tabs when snapPoint is 1 / full', () => {
    render(<MobileWineryDrawer {...defaultProps} snapPoint={1} />);

    expect(screen.getByRole('tablist')).toBeInTheDocument();
    const amenitiesTab = screen.getByRole('tab', { name: /amenities/i });
    expect(amenitiesTab).toBeInTheDocument();

    fireEvent.click(amenitiesTab);
    expect(defaultProps.setActiveTab).toHaveBeenCalledWith('amenities');
  });

  it('renders peek action bar when snapPoint is 300px', () => {
    render(<MobileWineryDrawer {...defaultProps} snapPoint="300px" />);

    expect(screen.getByTestId('route-from-current')).toBeInTheDocument();
    const logVisitBtn = screen.getByTestId('log-visit-button');
    fireEvent.click(logVisitBtn);
    expect(defaultProps.onLogVisit).toHaveBeenCalled();
  });

  it('handles trip badge click', () => {
    render(<MobileWineryDrawer {...defaultProps} />);

    const tripBadge = screen.getByTestId('trip-badge');
    expect(tripBadge).toBeInTheDocument();
    expect(tripBadge).toHaveTextContent('On Trip: Keuka Lake Tour');

    fireEvent.click(tripBadge);
    expect(defaultProps.onTripBadgeClick).toHaveBeenCalledWith(456);
  });

  describe('Tri-state status badge and decoupled layout loading (Phase 1)', () => {
    it('renders peek badge as "🟢 OPEN NOW" when loaded and open', () => {
      const openWinery = createMockWinery({
        ...mockWinery,
        openingHours: {
          open_now: true,
          periods: [{ open: { day: 0, hour: 0, minute: 0 } }],
        },
      });
      render(<MobileWineryDrawer {...defaultProps} winery={openWinery} isLoading={false} />);
      expect(screen.getByTestId('peek-open-status-tag')).toHaveTextContent('🟢 OPEN NOW');
    });

    it('renders peek badge as "🔴 CLOSED" when loaded and closed', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2026, 8, 30, 12, 0));
      const closedWinery = createMockWinery({
        ...mockWinery,
        openingHours: {
          open_now: false,
          periods: [{ open: { day: 2, hour: 10, minute: 0 }, close: { day: 2, hour: 17, minute: 0 } }],
        },
      });
      render(<MobileWineryDrawer {...defaultProps} winery={closedWinery} isLoading={false} />);
      expect(screen.getByTestId('peek-open-status-tag')).toHaveTextContent('🔴 CLOSED');
      jest.useRealTimers();
    });

    it('renders peek badge as "⚪ HOURS UNAVAILABLE" when loaded and hours are indeterminate', () => {
      const wineryWithoutHours = createMockWinery({
        ...mockWinery,
        openingHours: null,
      });
      render(<MobileWineryDrawer {...defaultProps} winery={wineryWithoutHours} isLoading={false} />);
      expect(screen.getByTestId('peek-open-status-tag')).toHaveTextContent('⚪ HOURS UNAVAILABLE');
      expect(screen.queryByText(/🔴 CLOSED/)).not.toBeInTheDocument();
    });

    it('renders animated skeleton pill in peek status badge when isLoading is true and hours are indeterminate', () => {
      const wineryWithoutHours = createMockWinery({
        ...mockWinery,
        openingHours: null,
      });
      render(<MobileWineryDrawer {...defaultProps} winery={wineryWithoutHours} isLoading={true} />);
      expect(screen.getByTestId('peek-status-skeleton')).toBeInTheDocument();
    });

    it('decoupled layout: renders cached winery content immediately when isLoading is true, only rendering full skeleton when winery is null', () => {
      // 1. Cached winery present with isLoading true
      render(<MobileWineryDrawer {...defaultProps} winery={mockWinery} isLoading={true} />);
      expect(screen.getByTestId('winery-modal-drawer')).toHaveAttribute('data-state', 'loading');
      expect(screen.getByTestId('drawer-title-card')).toBeInTheDocument();
      expect(screen.getByText('Dr. Konstantin Frank')).toBeInTheDocument();

      // 2. No winery present with isLoading true
      render(<MobileWineryDrawer {...defaultProps} winery={null} isLoading={true} />);
      expect(screen.queryByTestId('drawer-title-card')).not.toBeInTheDocument();
    });
  });
});
