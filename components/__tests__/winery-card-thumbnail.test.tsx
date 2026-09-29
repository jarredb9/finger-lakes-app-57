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
});
