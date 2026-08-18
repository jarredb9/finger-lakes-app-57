import { render, screen, fireEvent } from '@testing-library/react';
import { WineryImage } from '../winery-image';
import { createMockWinery } from '@/lib/test-utils/fixtures';
import * as useWineryPhotoModule from '@/hooks/use-winery-photo';

jest.mock('@/hooks/use-winery-photo');

describe('WineryImage', () => {
  const mockWinery = createMockWinery({
    name: 'Seneca Shore Wine Cellars',
    primary_photo_reference: 'places/photos/test-ref',
  });

  const mockCachePhoto = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a placeholder skeleton when imgSrc is null', () => {
    (useWineryPhotoModule.useWineryPhoto as jest.Mock).mockReturnValue({
      imgSrc: null,
      cachePhoto: mockCachePhoto,
    });

    const { container } = render(
      <WineryImage
        photoRef="places/photos/test-ref"
        winery={mockWinery}
        className="custom-img-class"
      />
    );

    const placeholder = container.querySelector('.bg-muted.animate-pulse');
    expect(placeholder).toBeInTheDocument();
    expect(placeholder).toHaveClass('custom-img-class');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders img element with correct props when imgSrc is available', () => {
    (useWineryPhotoModule.useWineryPhoto as jest.Mock).mockReturnValue({
      imgSrc: 'https://places.googleapis.com/v1/photos/test-ref/media',
      cachePhoto: mockCachePhoto,
    });

    render(
      <WineryImage
        photoRef="places/photos/test-ref"
        winery={mockWinery}
        className="w-full h-48 object-cover"
        alt="Custom alt text"
      />
    );

    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://places.googleapis.com/v1/photos/test-ref/media');
    expect(img).toHaveAttribute('alt', 'Custom alt text');
    expect(img).toHaveClass('w-full', 'h-48', 'object-cover');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('calls cachePhoto callback on image load', () => {
    (useWineryPhotoModule.useWineryPhoto as jest.Mock).mockReturnValue({
      imgSrc: 'https://places.googleapis.com/v1/photos/test-ref/media',
      cachePhoto: mockCachePhoto,
    });

    render(
      <WineryImage
        photoRef="places/photos/test-ref"
        winery={mockWinery}
      />
    );

    const img = screen.getByRole('img');
    fireEvent.load(img);
    expect(mockCachePhoto).toHaveBeenCalledTimes(1);
  });
});
