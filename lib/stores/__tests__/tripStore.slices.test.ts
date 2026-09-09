import fs from 'fs';
import path from 'path';
import { act } from '@testing-library/react';
import { createClient } from '@/utils/supabase/client';

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(),
}));

describe('ST-01: tripStore Slice Decomposition & Lifecycle', () => {
  const slicesDir = path.join(process.cwd(), 'lib/stores/slices');

  describe('file existence and modularity constraints (< 300 lines)', () => {
    const requiredSlices = [
      'tripDataSlice.ts',
      'tripUISlice.ts',
      'tripRealtimeSlice.ts',
    ];

    test.each(requiredSlices)('%s exists and is under 300 lines', (filename) => {
      const filePath = path.join(slicesDir, filename);
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      const lineCount = content.split('\n').length;
      expect(lineCount).toBeLessThanOrEqual(300);
    });
  });

  describe('slice creator exports', () => {
    it('exports createTripDataSlice, createTripUISlice, and createTripRealtimeSlice', () => {
      let tripDataModule: any = {};
      let tripUIModule: any = {};
      let tripRealtimeModule: any = {};

      try {
        // @ts-ignore
        tripDataModule = require('../slices/tripDataSlice');
      } catch {
        tripDataModule = {};
      }

      try {
        // @ts-ignore
        tripUIModule = require('../slices/tripUISlice');
      } catch {
        tripUIModule = {};
      }

      try {
        // @ts-ignore
        tripRealtimeModule = require('../slices/tripRealtimeSlice');
      } catch {
        tripRealtimeModule = {};
      }

      expect(typeof tripDataModule.createTripDataSlice).toBe('function');
      expect(typeof tripUIModule.createTripUISlice).toBe('function');
      expect(typeof tripRealtimeModule.createTripRealtimeSlice).toBe('function');
    });
  });

  describe('composed tripStore integration and channel cleanup', () => {
    let useTripStore: any;

    beforeEach(async () => {
      jest.clearAllMocks();
      const mod = await import('../tripStore');
      useTripStore = mod.useTripStore;
      act(() => {
        useTripStore.getState().reset();
      });
    });

    it('retains window.useTripStore backwards compatibility for test runners', () => {
      expect((global as any).window).toBeDefined();
      expect((global as any).window.useTripStore).toBe(useTripStore);
    });

    it('unsubscribes and cleans up Realtime channel on store.reset() (ST-11)', async () => {
      const mockUnsubscribe = jest.fn();
      const mockChannel = {
        on: jest.fn().mockReturnThis(),
        subscribe: jest.fn().mockReturnThis(),
        unsubscribe: mockUnsubscribe,
      };

      (createClient as jest.Mock).mockReturnValue({
        channel: jest.fn().mockReturnValue(mockChannel),
      });

      act(() => {
        useTripStore.getState().subscribeToTripUpdates();
      });

      expect(useTripStore.getState().subscription).toBe(mockChannel);

      act(() => {
        useTripStore.getState().reset();
      });

      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(useTripStore.getState().subscription).toBeNull();
    });
  });
});
