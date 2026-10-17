import { act } from '@testing-library/react';
import { useWineryStore } from '../wineryStore';
import { Winery } from '@/lib/types';
import { createMockWinery } from '@/lib/test-utils/fixtures';

// Mock idb-keyval for storage interaction
jest.mock('idb-keyval', () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  setMany: jest.fn(),
}));

// Mock Supabase client & utils to isolate store persistence
const mockRpc = jest.fn().mockResolvedValue({ data: [], error: null });
const mockInvoke = jest.fn().mockResolvedValue({ data: null, error: null });

(globalThis as any)._WINERY_MOCKS = {
  mockRpc,
  mockInvoke,
};

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    rpc: (...args: any[]) => (globalThis as any)._WINERY_MOCKS.mockRpc(...args),
    functions: {
      invoke: (...args: any[]) => (globalThis as any)._WINERY_MOCKS.mockInvoke(...args),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    })),
  })),
}));

jest.mock('@/lib/utils', () => {
  const actual = jest.requireActual('@/lib/utils');
  return {
    ...actual,
    invokeFunction: (...args: any[]) => (globalThis as any)._WINERY_MOCKS.mockInvoke(...args),
  };
});

describe('WineryStore Persistence & Version 2 Migration', () => {
  const { get: mockGet } = require('idb-keyval');

  beforeEach(() => {
    act(() => {
      useWineryStore.getState().reset();
    });
    jest.clearAllMocks();
    delete (process.env as any).NEXT_PUBLIC_IS_E2E;
  });

  describe('Persist Options Configuration', () => {
    it('configures Zustand persist with version 3', () => {
      const persistOptions = (useWineryStore as any).persist.getOptions();
      expect(persistOptions.version).toBe(3);
    });

    it('defines a custom migrate callback in persist options', () => {
      const persistOptions = (useWineryStore as any).persist.getOptions();
      expect(typeof persistOptions.migrate).toBe('function');
    });
  });

  describe('Selective Migration Function (v0/v1 -> v2)', () => {
    const validEnrichedWinery: Winery = {
      ...createMockWinery({ id: 'winery-enriched-valid' as any, name: 'Valid Enriched Winery' }),
      enrichment_tier: 'enriched',
      openingHours: {
        weekday_text: ['Monday: 10:00 AM – 5:00 PM'],
        periods: [{ open: { day: 1, hour: 10, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }],
      },
    };

    const corruptEnrichedWineryNullHours: Winery = {
      ...createMockWinery({ id: 'winery-corrupt-null-hours' as any, name: 'Corrupt Null Hours' }),
      enrichment_tier: 'enriched',
      openingHours: null,
    };

    const corruptEnrichedWineryUndefinedHours: Winery = {
      ...createMockWinery({ id: 'winery-corrupt-undef-hours' as any, name: 'Corrupt Undefined Hours' }),
      enrichment_tier: 'enriched',
      openingHours: undefined,
    };

    const corruptFullWineryNullHours: Winery = {
      ...createMockWinery({ id: 'winery-corrupt-full-tier' as any, name: 'Corrupt Full Tier' }),
      enrichment_tier: 'full',
      openingHours: null,
    };

    const basicMapMarkerWinery: Winery = {
      ...createMockWinery({ id: 'winery-basic-marker' as any, name: 'Basic Marker' }),
      enrichment_tier: 'basic',
      openingHours: null,
      latitude: 42.501,
      longitude: -76.852,
    };

    const unEnrichedMarkerWinery: Winery = {
      ...createMockWinery({ id: 'winery-unenriched-marker' as any, name: 'Unenriched Pin' }),
      enrichment_tier: undefined,
      openingHours: null,
      latitude: 42.450,
      longitude: -76.900,
    };

    const malformedRecord = {
      id: '',
      name: undefined,
      latitude: 'invalid-coordinate',
    } as any;

    it('purges corrupt enriched records lacking openingHours while preserving basic map marker records and valid enriched records', () => {
      const persistOptions = (useWineryStore as any).persist.getOptions();
      const oldState = {
        persistentWineries: [
          validEnrichedWinery,
          corruptEnrichedWineryNullHours,
          corruptEnrichedWineryUndefinedHours,
          corruptFullWineryNullHours,
          basicMapMarkerWinery,
          unEnrichedMarkerWinery,
          malformedRecord,
        ],
      };

      const migrated = persistOptions.migrate(oldState, 0);

      expect(migrated.persistentWineries).toBeDefined();
      const ids = migrated.persistentWineries.map((w: Winery) => w.id);

      expect(ids).not.toContain('winery-corrupt-null-hours');
      expect(ids).not.toContain('winery-corrupt-undef-hours');
      expect(ids).not.toContain('winery-corrupt-full-tier');
      expect(ids).not.toContain('');

      expect(ids).toContain('winery-enriched-valid');
      expect(ids).toContain('winery-basic-marker');
      expect(ids).toContain('winery-unenriched-marker');
      expect(migrated.persistentWineries).toHaveLength(3);
    });

    it('returns unmodified state when incoming version is already 2', () => {
      const persistOptions = (useWineryStore as any).persist.getOptions();
      const currentState = {
        persistentWineries: [corruptEnrichedWineryNullHours, basicMapMarkerWinery],
      };

      const migrated = persistOptions.migrate(currentState, 2);
      expect(migrated).toEqual(currentState);
    });
  });

  describe('End-to-End IndexedDB Rehydration Migration', () => {
    it('selectively purges corrupt cache on store rehydrate from version 0 storage payload', async () => {
      const validWinery = createMockWinery({
        id: 'winery-keep' as any,
        name: 'Keep Winery',
        openingHours: { weekday_text: ['Mon: Open'] },
        enrichment_tier: 'enriched',
      });

      const corruptWinery = createMockWinery({
        id: 'winery-purge' as any,
        name: 'Purge Winery',
        openingHours: null,
        enrichment_tier: 'enriched',
      });

      const basicWinery = createMockWinery({
        id: 'winery-basic' as any,
        name: 'Basic Winery Pin',
        openingHours: null,
        enrichment_tier: 'basic',
        latitude: 42.6,
        longitude: -76.9,
      });

      (mockGet as jest.Mock).mockResolvedValue(
        JSON.stringify({
          state: {
            persistentWineries: [validWinery, corruptWinery, basicWinery],
          },
          version: 0,
        })
      );

      await useWineryStore.persist.rehydrate();

      const persistent = useWineryStore.getState().persistentWineries;
      const ids = persistent.map((w) => w.id);

      expect(ids).toContain('winery-keep');
      expect(ids).toContain('winery-basic');
      expect(ids).not.toContain('winery-purge');
    });
  });

  describe('Version 3 Migration & Amenity Healing (Issue #73)', () => {
    it('resets poisoned false amenity booleans to null while preserving true values and metadata', () => {
      const persistOptions = (useWineryStore as any).persist.getOptions();
      const oldState = {
        persistentWineries: [
          {
            ...createMockWinery({ id: 'toast-winery-15504' as any, dbId: 15504 as any, name: 'Toast Winery' }),
            allows_dogs: false,
            has_ev_charging: false,
            serves_wine: false,
            good_for_children: false,
            outdoor_seating: false,
            isFavorite: true,
            favoriteIsPrivate: false,
            onWishlist: true,
            wishlistIsPrivate: true,
            userVisited: false,
            rating: 4.7,
            latitude: 42.75,
            longitude: -76.95,
          },
          {
            ...createMockWinery({ id: 'confirmed-winery' as any, dbId: 20001 as any, name: 'Confirmed Winery' }),
            allows_dogs: true,
            has_ev_charging: true,
            serves_wine: true,
            good_for_children: true,
            outdoor_seating: true,
            isFavorite: false,
          },
          {
            ...createMockWinery({ id: 'null-winery' as any, dbId: 20002 as any }),
            allows_dogs: null,
            has_ev_charging: null,
            serves_wine: null,
            good_for_children: null,
            outdoor_seating: null,
          },
        ],
      };

      const migrated = persistOptions.migrate(oldState, 2);

      expect(migrated.persistentWineries).toHaveLength(3);

      const healed = migrated.persistentWineries.find((w: Winery) => w.id === 'toast-winery-15504');
      expect(healed.allows_dogs).toBeNull();
      expect(healed.has_ev_charging).toBeNull();
      expect(healed.serves_wine).toBeNull();
      expect(healed.good_for_children).toBeNull();
      expect(healed.outdoor_seating).toBeNull();

      expect(healed.isFavorite).toBe(true);
      expect(healed.favoriteIsPrivate).toBe(false);
      expect(healed.onWishlist).toBe(true);
      expect(healed.wishlistIsPrivate).toBe(true);
      expect(healed.userVisited).toBe(false);
      expect(healed.rating).toBe(4.7);
      expect(healed.latitude).toBe(42.75);
      expect(healed.longitude).toBe(-76.95);

      const confirmed = migrated.persistentWineries.find((w: Winery) => w.id === 'confirmed-winery');
      expect(confirmed.allows_dogs).toBe(true);
      expect(confirmed.has_ev_charging).toBe(true);
      expect(confirmed.serves_wine).toBe(true);
      expect(confirmed.good_for_children).toBe(true);
      expect(confirmed.outdoor_seating).toBe(true);

      const nullWinery = migrated.persistentWineries.find((w: Winery) => w.id === 'null-winery');
      expect(nullWinery.allows_dogs).toBeNull();
      expect(nullWinery.has_ev_charging).toBeNull();
    });

    it('chains sequential migration from version 1 through version 2 to version 3', () => {
      const persistOptions = (useWineryStore as any).persist.getOptions();
      const v1State = {
        persistentWineries: [
          {
            ...createMockWinery({ id: 'valid-v1' as any, name: 'Valid V1' }),
            enrichment_tier: 'enriched',
            openingHours: { weekday_text: ['Mon: 10am-5pm'] },
            allows_dogs: false,
            has_ev_charging: true,
          },
          {
            ...createMockWinery({ id: 'corrupt-v1' as any, name: 'Corrupt V1' }),
            enrichment_tier: 'enriched',
            openingHours: null,
            allows_dogs: false,
          },
        ],
      };

      const migrated = persistOptions.migrate(v1State, 1);

      expect(migrated.persistentWineries).toHaveLength(1);
      expect(migrated.persistentWineries[0].id).toBe('valid-v1');
      expect(migrated.persistentWineries[0].allows_dogs).toBeNull();
      expect(migrated.persistentWineries[0].has_ev_charging).toBe(true);
    });

    it('returns unmodified state when incoming version is already 3', () => {
      const persistOptions = (useWineryStore as any).persist.getOptions();
      const v3State = {
        persistentWineries: [
          {
            ...createMockWinery({ id: 'v3-winery' as any }),
            allows_dogs: false,
          },
        ],
      };

      const migrated = persistOptions.migrate(v3State, 3);
      expect(migrated).toEqual(v3State);
    });
  });

  describe('End-to-End IndexedDB Rehydration Migration for Version 3', () => {
    it('heals poisoned false amenities when rehydrating from version 2 storage payload', async () => {
      const poisonedWinery = createMockWinery({
        id: 'toast-pwa-storage' as any,
        name: 'Toast Winery PWA',
        allows_dogs: false,
        has_ev_charging: false,
        outdoor_seating: false,
      });

      (mockGet as jest.Mock).mockResolvedValue(
        JSON.stringify({
          state: {
            persistentWineries: [poisonedWinery],
          },
          version: 2,
        })
      );

      await useWineryStore.persist.rehydrate();

      const persistent = useWineryStore.getState().persistentWineries;
      expect(persistent).toHaveLength(1);
      expect(persistent[0].id).toBe('toast-pwa-storage');
      expect(persistent[0].allows_dogs).toBeNull();
      expect(persistent[0].has_ev_charging).toBeNull();
      expect(persistent[0].outdoor_seating).toBeNull();
    });
  });
});
