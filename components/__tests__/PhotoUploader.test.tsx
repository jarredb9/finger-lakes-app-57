
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PhotoUploader from '../PhotoUploader';
import '@testing-library/jest-dom';

// Mock Lucide icons
jest.mock('lucide-react', () => ({
  Upload: () => <div data-testid="upload-icon" />,
  X: () => <div data-testid="x-icon" />,
}));

// Mock PhotoCard
jest.mock('../photo-card', () => ({
  __esModule: true,
  default: ({ photoPath, onDelete }: any) => (
    <div data-testid="photo-card">
      <span>{photoPath}</span>
      <button onClick={onDelete}>Delete</button>
    </div>
  ),
}));

// Mock URL methods
const mockCreateObjectURL = jest.fn();
const mockRevokeObjectURL = jest.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

describe('PhotoUploader', () => {
  const mockSetPhotos = jest.fn();
  const mockTogglePhotoForDeletion = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateObjectURL.mockReturnValue('blob:mock-url');
  });

  it('renders correctly without photos', () => {
    render(
      <PhotoUploader
        editingVisit={null}
        photos={[]}
        setPhotos={mockSetPhotos}
        photosToDelete={[]}
        togglePhotoForDeletion={mockTogglePhotoForDeletion}
      />
    );

    expect(screen.getByText(/Click to upload/i)).toBeInTheDocument();
    expect(screen.queryByTestId('photo-card')).not.toBeInTheDocument();
  });

  it('handles file selection and stabilizes them to Base64', async () => {
    render(
      <PhotoUploader
        editingVisit={null}
        photos={[]}
        setPhotos={mockSetPhotos}
        photosToDelete={[]}
        togglePhotoForDeletion={mockTogglePhotoForDeletion}
      />
    );

    const input = screen.getByTestId('photo-file-input');
    const file = new File(['test content'], 'test.png', { type: 'image/png' });
    
    // Polyfill arrayBuffer for JSDOM
    file.arrayBuffer = async () => new TextEncoder().encode('test content').buffer;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockSetPhotos).toHaveBeenCalled();
    });

    const updateFn = mockSetPhotos.mock.calls[0][0];
    const updatedPhotos = updateFn([]);
    
    expect(updatedPhotos).toHaveLength(1);
    expect(updatedPhotos[0]).toMatchObject({
      __isBase64: true,
      name: 'test.png',
      type: 'image/png'
    });
    expect(typeof (updatedPhotos[0] as any).base64).toBe('string');
  });

  it('displays existing photos when editing', () => {
    const editingVisit = {
      id: 1,
      photos: ['path/to/photo1.jpg', 'path/to/photo2.jpg'],
    } as any;

    render(
      <PhotoUploader
        editingVisit={editingVisit}
        photos={[]}
        setPhotos={mockSetPhotos}
        photosToDelete={[]}
        togglePhotoForDeletion={mockTogglePhotoForDeletion}
      />
    );

    expect(screen.getAllByTestId('photo-card')).toHaveLength(2);
    expect(screen.getByText('path/to/photo1.jpg')).toBeInTheDocument();
  });

  it('calls togglePhotoForDeletion when an existing photo is deleted', () => {
    const editingVisit = {
      id: 1,
      photos: ['path/to/photo1.jpg'],
    } as any;

    render(
      <PhotoUploader
        editingVisit={editingVisit}
        photos={[]}
        setPhotos={mockSetPhotos}
        photosToDelete={[]}
        togglePhotoForDeletion={mockTogglePhotoForDeletion}
      />
    );

    const deleteButton = screen.getByText('Delete');
    fireEvent.click(deleteButton);

    expect(mockTogglePhotoForDeletion).toHaveBeenCalledWith('path/to/photo1.jpg');
  });

  it('allows removing a newly added photo', () => {
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    
    render(
      <PhotoUploader
        editingVisit={null}
        photos={[file]}
        setPhotos={mockSetPhotos}
        photosToDelete={[]}
        togglePhotoForDeletion={mockTogglePhotoForDeletion}
      />
    );

    const removeButton = screen.getByTestId('x-icon').parentElement!;
    fireEvent.click(removeButton);

    expect(mockSetPhotos).toHaveBeenCalled();
    const updateFn = mockSetPhotos.mock.calls[0][0];
    const updatedPhotos = updateFn([file]);
    expect(updatedPhotos).toHaveLength(0);
  });

  it('handles Base64Photo objects in the photos prop', () => {
    const base64Photo = {
      __isBase64: true,
      base64: 'SGVsbG8=',
      name: 'base64-test.png',
      type: 'image/png'
    } as any;

    render(
      <PhotoUploader
        editingVisit={null}
        photos={[base64Photo]}
        setPhotos={mockSetPhotos}
        photosToDelete={[]}
        togglePhotoForDeletion={mockTogglePhotoForDeletion}
      />
    );

    // Should use data URL directly, NOT createObjectURL
    expect(mockCreateObjectURL).not.toHaveBeenCalled();
    const previewImage = screen.getByAltText(/Preview 1/i);
    expect(previewImage).toBeInTheDocument();
    expect(previewImage).toHaveAttribute('src', expect.stringContaining('data:image/png;base64,SGVsbG8='));
  });
});
