import { idbStorage } from '../idb-persist-storage';
import { useSyncStore } from '../syncStore';
import { set as idbSet } from 'idb-keyval';
import { checkAndCleanupQuota, isQuotaError } from '@/lib/utils/quota';
import { webcrypto } from 'node:crypto';

// Polyfill webcrypto for Node environment
if (!global.crypto || !global.crypto.subtle) {
  Object.defineProperty(global, 'crypto', {
    value: webcrypto,
    writable: true,
    configurable: true,
  });
}

// Mock idb-keyval
jest.mock('idb-keyval', () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
}));

describe('IndexedDB Quota Safeguards', () => {
  let dispatchEventSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Override implementations for this test suite
    (checkAndCleanupQuota as jest.Mock).mockResolvedValue(undefined);
    (isQuotaError as jest.Mock).mockImplementation((err: any) => {
      return err && (err.name === 'QuotaExceededError' || err.message === 'QuotaExceededError');
    });

    if (typeof window !== 'undefined') {
      dispatchEventSpy = jest.spyOn(window, 'dispatchEvent');
    }
  });

  afterEach(() => {
    if (dispatchEventSpy) {
      dispatchEventSpy.mockRestore();
    }
  });

  describe('idbStorage.setItem quota safeguards', () => {
    it('retries write after cleaning up quota on QuotaExceededError', async () => {
      const quotaError = new Error('QuotaExceededError');
      quotaError.name = 'QuotaExceededError';
      
      // First call throws quota error, second succeeds
      (idbSet as jest.Mock)
        .mockRejectedValueOnce(quotaError)
        .mockResolvedValueOnce(undefined);

      await idbStorage.setItem('test-key', 'test-value');

      expect(idbSet).toHaveBeenCalledTimes(2);
      expect(checkAndCleanupQuota).toHaveBeenCalledWith(0.8);
      if (dispatchEventSpy) {
        expect(dispatchEventSpy).not.toHaveBeenCalled();
      }
    });

    it('dispatches quota-exceeded-warning event if retry fails', async () => {
      const quotaError = new Error('QuotaExceededError');
      quotaError.name = 'QuotaExceededError';
      
      // Both attempts throw quota error
      (idbSet as jest.Mock)
        .mockRejectedValueOnce(quotaError)
        .mockRejectedValueOnce(quotaError);

      await expect(idbStorage.setItem('test-key', 'test-value')).rejects.toThrow();

      expect(idbSet).toHaveBeenCalledTimes(2);
      expect(checkAndCleanupQuota).toHaveBeenCalledWith(0.8);
      if (dispatchEventSpy) {
        expect(dispatchEventSpy).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'quota-exceeded-warning' })
        );
      }
    });
  });

  describe('syncStore.ts persistToIdb quota safeguards', () => {
    it('retries sync queue write after cleaning up quota on QuotaExceededError', async () => {
      const quotaError = new Error('QuotaExceededError');
      quotaError.name = 'QuotaExceededError';
      
      (idbSet as jest.Mock)
        .mockRejectedValueOnce(quotaError)
        .mockResolvedValueOnce(undefined);

      // Trigger mutation which calls persistToIdb
      await useSyncStore.getState().addMutation({
        type: 'log_visit',
        payload: { id: 1 },
        userId: 'test-user',
      });

      // Wait for the async persistToIdb chain to resolve
      await new Promise(process.nextTick);

      expect(idbSet).toHaveBeenCalledTimes(2);
      expect(checkAndCleanupQuota).toHaveBeenCalledWith(0.8);
      if (dispatchEventSpy) {
        expect(dispatchEventSpy).not.toHaveBeenCalled();
      }
    });

    it('dispatches quota-exceeded-warning event if sync queue retry fails', async () => {
      const quotaError = new Error('QuotaExceededError');
      quotaError.name = 'QuotaExceededError';
      
      (idbSet as jest.Mock)
        .mockRejectedValueOnce(quotaError)
        .mockRejectedValueOnce(quotaError);

      await useSyncStore.getState().addMutation({
        type: 'log_visit',
        payload: { id: 1 },
        userId: 'test-user',
      });

      await new Promise(process.nextTick);

      expect(idbSet).toHaveBeenCalledTimes(2);
      expect(checkAndCleanupQuota).toHaveBeenCalledWith(0.8);
      if (dispatchEventSpy) {
        expect(dispatchEventSpy).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'quota-exceeded-warning' })
        );
      }
    });
  });
});
