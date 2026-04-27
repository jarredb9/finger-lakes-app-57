import { checkAndCleanupQuota } from '../quota';

describe('checkAndCleanupQuota', () => {
  const originalCaches = global.caches;
  const originalNavigator = global.navigator;

  beforeEach(() => {
    // Mock caches
    (global as any).caches = {
      keys: jest.fn(),
      delete: jest.fn(),
    };
    
    // Mock navigator.storage
    Object.defineProperty(global.navigator, 'storage', {
      value: {
        estimate: jest.fn(),
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    (global as any).caches = originalCaches;
    (global as any).navigator = originalNavigator;
  });

  it('clears specific caches if quota usage exceeds the threshold', async () => {
    (navigator.storage.estimate as jest.Mock).mockResolvedValue({
      usage: 85,
      quota: 100,
    });
    
    // Cache names might include version hashes, so we use includes
    (caches.keys as jest.Mock).mockResolvedValue([
      'google-maps-tiles-v1',
      'pages-v1',
      'supabase-storage-v1',
      'other-cache'
    ]);
    (caches.delete as jest.Mock).mockResolvedValue(true);

    await checkAndCleanupQuota(0.8);

    expect(caches.delete).toHaveBeenCalledWith('google-maps-tiles-v1');
    expect(caches.delete).toHaveBeenCalledWith('pages-v1');
    expect(caches.delete).toHaveBeenCalledWith('supabase-storage-v1');
    expect(caches.delete).not.toHaveBeenCalledWith('other-cache');
  });

  it('does nothing if quota usage is below the threshold', async () => {
    (navigator.storage.estimate as jest.Mock).mockResolvedValue({
      usage: 50,
      quota: 100,
    });
    
    (caches.keys as jest.Mock).mockResolvedValue(['google-maps-tiles-v1']);

    await checkAndCleanupQuota(0.8);

    expect(caches.delete).not.toHaveBeenCalled();
  });

  it('gracefully handles missing storage estimate API', async () => {
    Object.defineProperty(global.navigator, 'storage', {
      value: undefined,
      configurable: true,
    });

    await expect(checkAndCleanupQuota()).resolves.not.toThrow();
  });
});
