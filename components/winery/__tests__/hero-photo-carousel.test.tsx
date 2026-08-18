/* eslint-disable @next/next/no-img-element */
import { render, screen, fireEvent } from '@testing-library/react';
import { HeroPhotoCarousel } from '../hero-photo-carousel';
import { createMockWinery } from '@/lib/test-utils/fixtures';

// Mock WineryImage
jest.mock('../winery-image', () => ({
  WineryImage: ({ photoRef, alt, className }: any) => (
    <img src={photoRef} alt={alt} className={className} data-testid={`mock-img-${photoRef}`} />
  ),
  __esModule: true,
  default: ({ photoRef, alt, className }: any) => (
    <img src={photoRef} alt={alt} className={className} data-testid={`mock-img-${photoRef}`} />
  ),
}));

// Mock embla-carousel-react
const mockScrollPrev = jest.fn();
const mockScrollNext = jest.fn();
const mockScrollTo = jest.fn();
const mockCanScrollPrev = jest.fn(() => true);
const mockCanScrollNext = jest.fn(() => true);
const mockSelectedScrollSnap = jest.fn(() => 0);
const mockOn = jest.fn();
const mockOff = jest.fn();

const mockEmblaApi = {
  scrollPrev: mockScrollPrev,
  scrollNext: mockScrollNext,
  scrollTo: mockScrollTo,
  canScrollPrev: mockCanScrollPrev,
  canScrollNext: mockCanScrollNext,
  selectedScrollSnap: mockSelectedScrollSnap,
  on: mockOn,
  off: mockOff,
};

jest.mock('embla-carousel-react', () => {
  return jest.fn(() => [jest.fn(), mockEmblaApi]);
});

describe('HeroPhotoCarousel', () => {
  const mockWineryWithMultiplePhotos = createMockWinery({
    name: 'Fox Run Vineyards',
    photo_references: ['photo-1', 'photo-2', 'photo-3'],
    primary_photo_reference: 'photo-1',
  });

  const mockWinerySinglePhoto = createMockWinery({
    name: 'Single Photo Winery',
    photo_references: [],
    primary_photo_reference: 'photo-single',
  });

  const mockWineryNoPhotos = createMockWinery({
    name: 'No Photo Winery',
    photo_references: [],
    primary_photo_reference: undefined,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders fallback primary photo when photo_references is empty', () => {
    render(
      <HeroPhotoCarousel
        winery={mockWinerySinglePhoto}
        isMobile={false}
      />
    );
    expect(screen.getByTestId('mock-img-photo-single')).toBeInTheDocument();
  });

  it('renders a fallback gradient when winery has no photos', () => {
    const { container } = render(
      <HeroPhotoCarousel winery={mockWineryNoPhotos} />
    );
    const gradient = container.querySelector('.bg-gradient-to-r');
    expect(gradient).toBeInTheDocument();
  });

  it('renders a single static image on mobile viewports when not in lightbox mode', () => {
    const onPhotoClick = jest.fn();
    render(
      <HeroPhotoCarousel
        winery={mockWineryWithMultiplePhotos}
        isMobile={true}
        isLightbox={false}
        onPhotoClick={onPhotoClick}
      />
    );

    const img = screen.getByTestId('mock-img-photo-1');
    expect(img).toBeInTheDocument();
    // Only one image should be rendered
    expect(screen.queryByTestId('mock-img-photo-2')).not.toBeInTheDocument();

    fireEvent.click(img.parentElement!);
    expect(onPhotoClick).toHaveBeenCalledWith('photo-1');
  });

  it('renders full carousel on desktop with multiple photos and navigation controls', () => {
    const onPhotoClick = jest.fn();
    render(
      <HeroPhotoCarousel
        winery={mockWineryWithMultiplePhotos}
        isMobile={false}
        onPhotoClick={onPhotoClick}
      />
    );

    expect(screen.getByTestId('mock-img-photo-1')).toBeInTheDocument();
    expect(screen.getByTestId('mock-img-photo-2')).toBeInTheDocument();
    expect(screen.getByTestId('mock-img-photo-3')).toBeInTheDocument();

    const prevBtn = screen.getByLabelText('Previous photo');
    const nextBtn = screen.getByLabelText('Next photo');
    expect(prevBtn).toBeInTheDocument();
    expect(nextBtn).toBeInTheDocument();

    fireEvent.click(nextBtn);
    expect(mockScrollNext).toHaveBeenCalled();

    fireEvent.click(prevBtn);
    expect(mockScrollPrev).toHaveBeenCalled();
  });

  it('renders pagination dots for multiple photos and handles dot clicks', () => {
    render(
      <HeroPhotoCarousel
        winery={mockWineryWithMultiplePhotos}
        isMobile={false}
      />
    );

    const dot2 = screen.getByLabelText('Go to photo 2');
    expect(dot2).toBeInTheDocument();
    fireEvent.click(dot2);
    expect(mockScrollTo).toHaveBeenCalledWith(1);
  });

  it('renders carousel in lightbox mode even if isMobile is true', () => {
    render(
      <HeroPhotoCarousel
        winery={mockWineryWithMultiplePhotos}
        isMobile={true}
        isLightbox={true}
      />
    );

    // In lightbox mode, all photos are rendered in carousel
    expect(screen.getByTestId('mock-img-photo-1')).toBeInTheDocument();
    expect(screen.getByTestId('mock-img-photo-2')).toBeInTheDocument();
  });
});
