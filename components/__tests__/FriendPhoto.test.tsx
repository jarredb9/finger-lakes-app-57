import { render, screen, waitFor } from '@testing-library/react';
import { FriendPhoto } from '../friend-photo';
import '@testing-library/jest-dom';

// Mock Lucide icons
jest.mock('lucide-react', () => ({
  Loader2: () => <div data-testid="loader-icon" />
}));

const mockCreateSignedUrl = jest.fn();

// Mock Supabase client
jest.mock('@/utils/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: mockCreateSignedUrl
      })
    }
  })
}));

describe('FriendPhoto Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a loader state initially while fetching signed URL', () => {
    mockCreateSignedUrl.mockReturnValue(new Promise(() => {})); // Never resolves
    
    render(<FriendPhoto photoPath="user-1/winery-1/photo.jpg" alt="Test Friend Photo" />);
    
    expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
  });

  it('resolves signed URL and renders the Image component', async () => {
    mockCreateSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: 'https://supabase.co/storage/v1/object/sign/visit-photos/mock.jpg' },
      error: null
    });

    render(<FriendPhoto photoPath="user-1/winery-1/photo.jpg" alt="Test Friend Photo" />);

    await waitFor(() => {
      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://supabase.co/storage/v1/object/sign/visit-photos/mock.jpg');
      expect(img).toHaveAttribute('alt', 'Test Friend Photo');
    });
  });

  it('renders error state if createSignedUrl fails', async () => {
    mockCreateSignedUrl.mockResolvedValueOnce({
      data: null,
      error: new Error('Failed to create signed URL')
    });

    render(<FriendPhoto photoPath="user-1/winery-1/photo.jpg" alt="Test Friend Photo" />);

    await waitFor(() => {
      expect(screen.getByText('Unavailable')).toBeInTheDocument();
    });
  });

  it('directly uses blob: and data: URLs without calling Supabase', async () => {
    render(<FriendPhoto photoPath="blob:http://localhost:3000/123-456" alt="Blob Photo" />);

    await waitFor(() => {
      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'blob:http://localhost:3000/123-456');
    });

    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });
});
