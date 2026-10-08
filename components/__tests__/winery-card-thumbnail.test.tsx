import { render, screen, fireEvent } from '@testing-library/react';
import WineryCardThumbnail from '../winery-card-thumbnail';
import { createMockWinery } from '@/lib/test-utils/fixtures';

// Mock Next.js Image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} alt={props.alt} />;
  },
}));

describe('WineryCardThumbnail', () => {
  const mockWinery = createMockWinery({
    name: 'Test Winery',
    address: '123 Vine St',
    rating: 4.5
  });

  it('renders winery details correctly', () => {
    render(<WineryCardThumbnail winery={mockWinery} />);
    
    expect(screen.getByText('Test Winery')).toBeInTheDocument();
    expect(screen.getByText('123 Vine St')).toBeInTheDocument();
    expect(screen.getByText('4.5')).toBeInTheDocument();
  });

  it('renders "Visited" badge when userVisited is true', () => {
    const visitedWinery = { ...mockWinery, userVisited: true };
    render(<WineryCardThumbnail winery={visitedWinery} />);
    
    expect(screen.getByText('Visited')).toBeInTheDocument();
  });

  it('renders "Loved" badge when isFavorite is true', () => {
    const favWinery = { ...mockWinery, isFavorite: true };
    render(<WineryCardThumbnail winery={favWinery} />);
    
    expect(screen.getByText('Favorite')).toBeInTheDocument();
  });

  it('renders "Want" badge when onWishlist is true and NOT visited', () => {
    const wishWinery = { ...mockWinery, onWishlist: true, userVisited: false };
    render(<WineryCardThumbnail winery={wishWinery} />);
    
    expect(screen.getByText('Want to Go')).toBeInTheDocument();
  });

  it('renders both "Visited" and "Want to Go" badges when userVisited is true and onWishlist is true, maintaining emerald status indicator', () => {
    const wishAndVisited = { ...mockWinery, onWishlist: true, userVisited: true };
    const { container } = render(<WineryCardThumbnail winery={wishAndVisited} />);
    
    expect(screen.getByText('Visited')).toBeInTheDocument();
    expect(screen.getByText('Want to Go')).toBeInTheDocument();
    
    const statusIndicator = container.querySelector('.w-1');
    expect(statusIndicator).toHaveClass('bg-emerald-500');
    expect(statusIndicator).not.toHaveClass('bg-purple-500');
  });

  it('maintains favorite (amber) status priority when winery is favorite, visited, and on wishlist', () => {
    const allFlagsWinery = { ...mockWinery, isFavorite: true, userVisited: true, onWishlist: true };
    const { container } = render(<WineryCardThumbnail winery={allFlagsWinery} />);
    
    expect(screen.getByText('Favorite')).toBeInTheDocument();
    expect(screen.getByText('Visited')).toBeInTheDocument();
    expect(screen.getByText('Want to Go')).toBeInTheDocument();
    
    const statusIndicator = container.querySelector('.w-1');
    expect(statusIndicator).toHaveClass('bg-amber-500');
  });

  it('calls onClick when clicked', () => {
    const handleClick = jest.fn();
    render(<WineryCardThumbnail winery={mockWinery} onClick={handleClick} />);
    
    fireEvent.click(screen.getByTestId(`winery-card-${mockWinery.name}`));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  describe('Operational Status Badges and Null Hours Resilience (Phase 1)', () => {
    it('renders "Open" badge with clock icon when isOpenNow is true', () => {
      const openWinery = {
        ...mockWinery,
        openingHours: {
          open_now: true,
          periods: [{ open: { day: 0, hour: 0, minute: 0 } }],
        },
      };
      render(<WineryCardThumbnail winery={openWinery} />);
      expect(screen.getByText('Open')).toBeInTheDocument();
    });

    it('renders "Closed" badge with clock icon when isOpenNow is false', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2026, 8, 30, 12, 0));
      const closedWinery = {
        ...mockWinery,
        openingHours: {
          open_now: false,
          periods: [{ open: { day: 2, hour: 10, minute: 0 }, close: { day: 2, hour: 17, minute: 0 } }],
        },
      };
      render(<WineryCardThumbnail winery={closedWinery} />);
      expect(screen.getByText('Closed')).toBeInTheDocument();
      jest.useRealTimers();
    });

    it('cleanly omits operational status badge when isOpen is null without defaulting to "Closed"', () => {
      const wineryWithoutHours = {
        ...mockWinery,
        openingHours: null,
      };
      render(<WineryCardThumbnail winery={wineryWithoutHours} />);
      expect(screen.queryByText('Open')).not.toBeInTheDocument();
      expect(screen.queryByText('Closed')).not.toBeInTheDocument();
      expect(screen.queryByText(/hours/i)).not.toBeInTheDocument();
    });
  });

  describe("Ratings and Review Counts (Phase 4 Task 3)", () => {
    it("renders star rating and user review count when both are provided", () => {
      const wineryWithReviews = {
        ...mockWinery,
        rating: 4.8,
        userRatingCount: 125,
      };
      render(<WineryCardThumbnail winery={wineryWithReviews} />);
      expect(screen.getByText("4.8")).toBeInTheDocument();
      expect(screen.getByText("(125)")).toBeInTheDocument();
    });

    it("omits review count when userRatingCount is null, undefined, or 0", () => {
      const wineryNoReviews = {
        ...mockWinery,
        rating: 4.5,
        userRatingCount: null,
      };
      render(<WineryCardThumbnail winery={wineryNoReviews} />);
      expect(screen.getByText("4.5")).toBeInTheDocument();
      expect(screen.queryByText(/\(\d+\)/)).not.toBeInTheDocument();
    });

    it("omits rating and review count container when rating is null, undefined, or 0", () => {
      const wineryUnrated = {
        ...mockWinery,
        rating: null,
        userRatingCount: 50,
      };
      render(<WineryCardThumbnail winery={wineryUnrated} />);
      expect(screen.queryByText("50")).not.toBeInTheDocument();
      expect(screen.queryByText("(50)")).not.toBeInTheDocument();
    });
  });

  describe("Status Badges and Visual Indicators (Phase 4 Task 3)", () => {
    it("renders unvisited winery with default muted indicator strip and no status badges", () => {
      const plainWinery = {
        ...mockWinery,
        isFavorite: false,
        userVisited: false,
        onWishlist: false,
      };
      const { container } = render(<WineryCardThumbnail winery={plainWinery} />);

      const statusIndicator = container.querySelector(".w-1");
      expect(statusIndicator).toHaveClass("bg-muted");
      expect(statusIndicator).not.toHaveClass("bg-amber-500");
      expect(statusIndicator).not.toHaveClass("bg-emerald-500");
      expect(statusIndicator).not.toHaveClass("bg-purple-500");

      expect(screen.queryByText("Favorite")).not.toBeInTheDocument();
      expect(screen.queryByText("Visited")).not.toBeInTheDocument();
      expect(screen.queryByText("Want to Go")).not.toBeInTheDocument();
    });

    it("renders Favorite badge with amber styling and indicator", () => {
      const favWinery = { ...mockWinery, isFavorite: true, userVisited: false, onWishlist: false };
      const { container } = render(<WineryCardThumbnail winery={favWinery} />);

      const badge = screen.getByText("Favorite");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass("bg-amber-100", "text-amber-800");

      const statusIndicator = container.querySelector(".w-1");
      expect(statusIndicator).toHaveClass("bg-amber-500");
    });

    it("renders Visited badge with emerald styling and indicator", () => {
      const visitedWinery = { ...mockWinery, isFavorite: false, userVisited: true, onWishlist: false };
      const { container } = render(<WineryCardThumbnail winery={visitedWinery} />);

      const badge = screen.getByText("Visited");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass("bg-emerald-100", "text-emerald-800");

      const statusIndicator = container.querySelector(".w-1");
      expect(statusIndicator).toHaveClass("bg-emerald-500");
    });

    it("renders Want to Go badge with purple styling and indicator", () => {
      const wishWinery = { ...mockWinery, isFavorite: false, userVisited: false, onWishlist: true };
      const { container } = render(<WineryCardThumbnail winery={wishWinery} />);

      const badge = screen.getByText("Want to Go");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass("bg-purple-100", "text-purple-800");

      const statusIndicator = container.querySelector(".w-1");
      expect(statusIndicator).toHaveClass("bg-purple-500");
    });
  });
});
