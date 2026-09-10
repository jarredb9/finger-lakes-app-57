import { idbStorage } from '../idb-persist-storage';
import { checkAndCleanupQuota, isQuotaError } from '@/lib/utils/quota';
import { setMany as idbSetMany } from 'idb-keyval';

const mockSetMany = idbSetMany as unknown as jest.Mock;

jest.mock('@/lib/utils/quota', () => ({
  checkAndCleanupQuota: jest.fn().mockResolvedValue(undefined),
  isQuotaError: jest.fn(),
}));

describe('ST-13: Atomic Multi-Key Persistence in idbStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exports an atomic setMany function on idbStorage', () => {
    expect(typeof (idbStorage as any).setMany).toBe('function');
  });

  it('writes multiple key-value pairs in a single atomic transaction via setMany', async () => {
    mockSetMany.mockResolvedValueOnce(undefined);

    const entries: [string, string][] = [
      ['trip-storage', '{"state":{"trips":[]}}'],
      ['visit-storage', '{"state":{"visits":[]}}'],
    ];

    await (idbStorage as any).setMany(entries);

    expect(mockSetMany).toHaveBeenCalledTimes(1);
    expect(mockSetMany).toHaveBeenCalledWith(entries);
  });

  it('atomically rejects and does not leave partial state if transaction fails', async () => {
    const transactionError = new Error('IndexedDB Transaction Failed');
    mockSetMany.mockRejectedValueOnce(transactionError);

    const entries: [string, string][] = [
      ['key-1', 'val-1'],
      ['key-2', 'val-2'],
    ];

    await expect((idbStorage as any).setMany(entries)).rejects.toThrow(transactionError);
  });

  it('handles QuotaExceededError and retries atomic batch write after cleanup', async () => {
    const quotaError = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    (isQuotaError as unknown as jest.Mock).mockReturnValue(true);
    mockSetMany
      .mockRejectedValueOnce(quotaError)
      .mockResolvedValueOnce(undefined);

    const entries: [string, string][] = [
      ['trip-storage', '{"data":"large"}'],
      ['visit-storage', '{"data":"large"}'],
    ];

    await (idbStorage as any).setMany(entries);

    expect(checkAndCleanupQuota).toHaveBeenCalledWith(0.8);
    expect(mockSetMany).toHaveBeenCalledTimes(2);
  });

  it('dispatches quota-exceeded-warning event when retry also fails', async () => {
    const quotaError = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    (isQuotaError as unknown as jest.Mock).mockReturnValue(true);
    mockSetMany.mockRejectedValue(quotaError);

    const dispatchSpy = jest.spyOn(window, 'dispatchEvent');

    const entries: [string, string][] = [['key', 'value']];

    await expect((idbStorage as any).setMany(entries)).rejects.toThrow(quotaError);
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quota-exceeded-warning' })
    );

    dispatchSpy.mockRestore();
  });
});
