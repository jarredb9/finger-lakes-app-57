import { render, screen, fireEvent } from '@testing-library/react';
import { PhotoLightboxModal } from '../photo-lightbox-modal';
import { createMockWinery } from '@/lib/test-utils/fixtures';

// Mock HeroPhotoCarousel
jest.mock('../hero-photo-carousel', () => ({
  HeroPhotoCarousel: ({ winery, initialPhotoRef, isLightbox }: any) => (
    <div data-testid="mock-hero-carousel" data-photo-ref={initialPhotoRef} data-lightbox={String(isLightbox)}>
      {winery.name}
    </div>
  ),
  __esModule: true,
  default: ({ winery, initialPhotoRef, isLightbox }: any) => (
    <div data-testid="mock-hero-carousel" data-photo-ref={initialPhotoRef} data-lightbox={String(isLightbox)}>
      {winery.name}
    </div>
  ),
}));

describe('PhotoLightboxModal', () => {
  const mockWinery = createMockWinery({
    name: 'Dr. Konstantin Frank',
    photo_references: ['photo-1', 'photo-2'],
  });

  const mockOnClose = jest.fn();
  const mockOnPhotoSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when photoRef is null', () => {
    const { container } = render(
      <PhotoLightboxModal
        winery={mockWinery}
        photoRef={null}
        onClose={mockOnClose}
      />
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('photo-lightbox-modal')).not.toBeInTheDocument();
  });

  it('renders nothing when winery is null', () => {
    const { container } = render(
      <PhotoLightboxModal
        winery={null}
        photoRef="photo-1"
        onClose={mockOnClose}
      />
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('photo-lightbox-modal')).not.toBeInTheDocument();
  });

  it('renders portal in document.body when winery and photoRef are provided', () => {
    render(
      <PhotoLightboxModal
        winery={mockWinery}
        photoRef="photo-1"
        onClose={mockOnClose}
        onPhotoSelect={mockOnPhotoSelect}
      />
    );

    const modal = screen.getByTestId('photo-lightbox-modal');
    expect(modal).toBeInTheDocument();
    expect(modal.parentElement).toBe(document.body);

    const closeBtn = screen.getByTestId('close-lightbox-button');
    expect(closeBtn).toBeInTheDocument();

    const carousel = screen.getByTestId('mock-hero-carousel');
    expect(carousel).toBeInTheDocument();
    expect(carousel).toHaveAttribute('data-photo-ref', 'photo-1');
    expect(carousel).toHaveAttribute('data-lightbox', 'true');
  });

  it('calls onClose when close button is clicked', () => {
    render(
      <PhotoLightboxModal
        winery={mockWinery}
        photoRef="photo-1"
        onClose={mockOnClose}
      />
    );

    const closeBtn = screen.getByTestId('close-lightbox-button');
    fireEvent.click(closeBtn);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking on backdrop', () => {
    render(
      <PhotoLightboxModal
        winery={mockWinery}
        photoRef="photo-1"
        onClose={mockOnClose}
      />
    );

    const modal = screen.getByTestId('photo-lightbox-modal');
    fireEvent.click(modal);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
