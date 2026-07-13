import { compressImage } from '../image';

describe('compressImage', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
      window.URL.revokeObjectURL = jest.fn();
    }
  });

  it('returns original file if type is not image', async () => {
    const file = new File(['dummy content'], 'text.txt', { type: 'text/plain' });
    const result = await compressImage(file);
    expect(result).toBe(file);
  });

  it('compresses and resizes image using canvas', async () => {
    const mockBlob = new Blob(['mock-compressed-data'], { type: 'image/jpeg' });
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: jest.fn(() => ({
        drawImage: jest.fn(),
      })),
      toBlob: jest.fn((cb) => cb(mockBlob)),
    };

    const createElementSpy = jest.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'canvas') return mockCanvas as any;
      return {} as any;
    });

    // Mock Image
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 3000;
      height = 1500;
      _src = '';

      set src(val: string) {
        this._src = val;
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 0);
      }
      get src() {
        return this._src;
      }
    }
    const originalImage = window.Image;
    window.Image = MockImage as any;

    const file = new File(['original-data'], 'photo.png', { type: 'image/png' });
    const result = await compressImage(file, 2048, 0.8);

    expect(result).toBeInstanceOf(File);
    expect(result.type).toBe('image/jpeg');
    expect(mockCanvas.width).toBe(2048);
    expect(mockCanvas.height).toBe(1024); // 1500 * 2048 / 3000 = 1024

    createElementSpy.mockRestore();
    window.Image = originalImage;
  });
});
