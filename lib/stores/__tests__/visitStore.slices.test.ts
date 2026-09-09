import fs from 'fs';
import path from 'path';
import { act } from '@testing-library/react';
import { createClient } from '@/utils/supabase/client';

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(),
}));

describe('ST-01: visitStore Slice Decomposition & Lifecycle', () => {
  const slicesDir = path.join(process.cwd(), 'lib/stores/slices');

  describe('file existence and modularity constraints (< 300 lines)', () => {
    const requiredSlices = [
      'visitDataSlice.ts',
      'visitUISlice.ts',
      'visitRealtimeSlice.ts',
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
    it('exports createVisitDataSlice, createVisitUISlice, and createVisitRealtimeSlice', () => {
      let visitDataModule: any = {};
      let visitUIModule: any = {};
      let visitRealtimeModule: any = {};

      try {
        // @ts-ignore
        visitDataModule = require('../slices/visitDataSlice');
      } catch {
        visitDataModule = {};
      }

      try {
        // @ts-ignore
        visitUIModule = require('../slices/visitUISlice');
      } catch {
        visitUIModule = {};
      }

      try {
        // @ts-ignore
        visitRealtimeModule = require('../slices/visitRealtimeSlice');
      } catch {
        visitRealtimeModule = {};
      }

      expect(typeof visitDataModule.createVisitDataSlice).toBe('function');
      expect(typeof visitUIModule.createVisitUISlice).toBe('function');
      expect(typeof visitRealtimeModule.createVisitRealtimeSlice).toBe('function');
    });
  });

  describe('composed visitStore integration and channel cleanup', () => {
    let useVisitStore: any;

    beforeEach(() => {
      jest.clearAllMocks();
      jest.isolateModules(() => {
        useVisitStore = require('../visitStore').useVisitStore;
      });
      act(() => {
        useVisitStore.getState().reset();
      });
    });

    it('retains window.useVisitStore backwards compatibility for test runners', () => {
      expect((global as any).window).toBeDefined();
      expect((global as any).window.useVisitStore).toBe(useVisitStore);
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
        useVisitStore.getState().subscribeToVisitUpdates();
      });

      expect(useVisitStore.getState().subscription).toBe(mockChannel);

      act(() => {
        useVisitStore.getState().reset();
      });

      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(useVisitStore.getState().subscription).toBeNull();
    });
  });
});
