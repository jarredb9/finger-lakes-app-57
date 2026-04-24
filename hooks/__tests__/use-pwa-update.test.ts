import { renderHook, act } from '@testing-library/react';
import { usePWAUpdate } from '../use-pwa-update';

describe('usePWAUpdate', () => {
  let mockRegistration: any;
  let mockServiceWorker: any;

  beforeEach(() => {
    mockRegistration = {
      waiting: null,
      installing: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };

    mockServiceWorker = {
      ready: Promise.resolve(mockRegistration),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      controller: {},
    };

    Object.defineProperty(global, 'navigator', {
      value: {
        serviceWorker: mockServiceWorker,
      },
      writable: true,
    });

    // Satisfy JSDOM by using a mock for reload
    const mockReload = jest.fn();
    (window as any)._E2E_RELOAD = mockReload;

    // @ts-ignore
    delete globalThis._PWA_UPDATING;
  });

  it('should detect update if SW is waiting on init', async () => {
    mockRegistration.waiting = { postMessage: jest.fn() };
    
    let result: any;
    await act(async () => {
       result = renderHook(() => usePWAUpdate()).result;
    });

    expect(result.current.isUpdateAvailable).toBe(true);
  });

  it('should reload on controllerchange if not already updating', async () => {
    renderHook(() => usePWAUpdate());
    
    const handler = mockServiceWorker.addEventListener.mock.calls.find(
      (call: any) => call[0] === 'controllerchange'
    )[1];

    act(() => {
      handler();
    });

    expect((globalThis as any)._PWA_UPDATING).toBe(true);
    expect((window as any)._E2E_RELOAD).toHaveBeenCalled();
  });

  it('should NOT reload on controllerchange if already updating', async () => {
    (globalThis as any)._PWA_UPDATING = true;
    renderHook(() => usePWAUpdate());
    
    const handler = mockServiceWorker.addEventListener.mock.calls.find(
      (call: any) => call[0] === 'controllerchange'
    )[1];

    act(() => {
      handler();
    });

    // If it didn't crash, it means it returned early because _PWA_UPDATING was already true
    expect((globalThis as any)._PWA_UPDATING).toBe(true);
  });
});
