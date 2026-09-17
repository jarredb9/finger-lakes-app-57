import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { MockMapsManager, createDefaultMockState } from '../utils';

/**
 * Phase 6 Task 1 (Red Phase): Fixture Contract Parity Tests
 * 
 * Verifies:
 * 1. Modular Fixture Module Structure (target of Phase 6 Task 2)
 * 2. MockMapsManager Legacy Backward Compatibility Parity
 * 3. Failure Injectors Interface & Routing Contract
 * 4. Bypass Toggles State Transition Contract
 */
test.describe('Fixture Contract Parity & Modular Architecture', () => {
  const fixturesDir = path.resolve(__dirname, '../fixtures');

  test.describe('Modular Fixtures Architecture Contract (Phase 6 Task 2 Target)', () => {
    test('e2e/fixtures directory exists with modular components', () => {
      const exists = fs.existsSync(fixturesDir);
      expect(exists, 'e2e/fixtures directory must exist').toBe(true);
    });

    test('e2e/fixtures/maps.fixture.ts exists and satisfies contract', async () => {
      const file = path.join(fixturesDir, 'maps.fixture.ts');
      expect(fs.existsSync(file), 'maps.fixture.ts must exist under e2e/fixtures/').toBe(true);

      if (fs.existsSync(file)) {
        const mod = await import(file);
        expect(mod.MapsFixtureManager || mod.mapsFixture).toBeDefined();
      }
    });

    test('e2e/fixtures/auth.fixture.ts exists and satisfies contract', async () => {
      const file = path.join(fixturesDir, 'auth.fixture.ts');
      expect(fs.existsSync(file), 'auth.fixture.ts must exist under e2e/fixtures/').toBe(true);

      if (fs.existsSync(file)) {
        const mod = await import(file);
        expect(mod.AuthFixtureManager || mod.authFixture).toBeDefined();
      }
    });

    test('e2e/fixtures/trips.fixture.ts exists and satisfies contract', async () => {
      const file = path.join(fixturesDir, 'trips.fixture.ts');
      expect(fs.existsSync(file), 'trips.fixture.ts must exist under e2e/fixtures/').toBe(true);

      if (fs.existsSync(file)) {
        const mod = await import(file);
        expect(mod.TripsFixtureManager || mod.tripsFixture).toBeDefined();
      }
    });

    test('e2e/fixtures/index.ts exports composite test with fixtures', async () => {
      const file = path.join(fixturesDir, 'index.ts');
      expect(fs.existsSync(file), 'index.ts must exist under e2e/fixtures/').toBe(true);

      if (fs.existsSync(file)) {
        const mod = await import(file);
        expect(mod.test).toBeDefined();
        expect(typeof mod.test.extend).toBe('function');
      }
    });
  });

  test.describe('MockMapsManager Backward-Compatible API Parity Contract', () => {
    test('MockMapsManager implements all public methods expected by existing specs', () => {
      const manager = new MockMapsManager({} as any);

      // Core Lifecycle & Setup
      expect(typeof manager.setupLogging).toBe('function');
      expect(typeof manager.getState).toBe('function');
      expect(typeof manager.getEquivalentWineryIds).toBe('function');
      expect(typeof manager.enableServiceWorker).toBe('function');
      expect(typeof manager.initDefaultMocks).toBe('function');

      // Failure Injectors
      expect(typeof manager.failMarkers).toBe('function');
      expect(typeof manager.failTrips).toBe('function');
      expect(typeof manager.failLogin).toBe('function');

      // Places API
      expect(typeof manager.mockPlacesV1).toBe('function');

      // Bypass Methods
      expect(typeof manager.useRealSocial).toBe('function');
      expect(typeof manager.useRealFavorites).toBe('function');
      expect(typeof manager.useRealVisits).toBe('function');
      expect(typeof manager.useRealTrips).toBe('function');
    });

    test('MockMapsManager exposes all legacy bypass flags defaulting to false', () => {
      const manager = new MockMapsManager({} as any);
      expect(manager.realSocialEnabled).toBe(false);
      expect(manager.realFavoritesEnabled).toBe(false);
      expect(manager.realVisitsEnabled).toBe(false);
      expect(manager.realTripsEnabled).toBe(false);
    });

    test('createDefaultMockState initializes isolated collections', () => {
      const state = createDefaultMockState();
      expect(state.trips).toBeNull();
      expect(state.visits).toBeNull();
      expect(state.activityFeed).toBeNull();
      expect(state.social).toBeNull();
      expect(state.socialMap instanceof Map).toBe(true);
      expect(state.tripMembersMap instanceof Map).toBe(true);
      expect(state.favoritesMap instanceof Map).toBe(true);
      expect(state.wishlistMap instanceof Map).toBe(true);
      expect(state.favoritePrivacyMap instanceof Map).toBe(true);
      expect(state.wishlistPrivacyMap instanceof Map).toBe(true);
    });

    test('getEquivalentWineryIds normalizes winery IDs into canonical keys', () => {
      const manager = new MockMapsManager({} as any);
      const ids = manager.getEquivalentWineryIds('ch-12345-mock-winery-1');
      expect(ids).toContain('ch-12345-mock-winery-1');
      expect(ids).toContain('1');
    });
  });

  test.describe('Bypass Toggles Contract', () => {
    test('bypass methods transition flags to true', async () => {
      const manager = new MockMapsManager({} as any);

      expect(manager.realSocialEnabled).toBe(false);
      await manager.useRealSocial();
      expect(manager.realSocialEnabled).toBe(true);

      expect(manager.realFavoritesEnabled).toBe(false);
      await manager.useRealFavorites();
      expect(manager.realFavoritesEnabled).toBe(true);

      expect(manager.realVisitsEnabled).toBe(false);
      await manager.useRealVisits();
      expect(manager.realVisitsEnabled).toBe(true);

      expect(manager.realTripsEnabled).toBe(false);
      await manager.useRealTrips();
      expect(manager.realTripsEnabled).toBe(true);
    });
  });

  test.describe('Failure Injectors Signature Contract', () => {
    test('failure injector methods return Promises', () => {
      const dummyPage = {
        addInitScript: () => Promise.resolve(),
        evaluate: () => Promise.resolve(),
        context: () => ({
          route: () => Promise.resolve(),
        }),
      } as any;

      const manager = new MockMapsManager(dummyPage);
      expect(manager.failMarkers()).toBeInstanceOf(Promise);
      expect(manager.failTrips()).toBeInstanceOf(Promise);
      expect(manager.failLogin()).toBeInstanceOf(Promise);
    });
  });
});
