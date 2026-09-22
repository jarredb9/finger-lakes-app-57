/* eslint-disable react-hooks/rules-of-hooks */
import fs from 'fs';
import path from 'path';
import { Page, test as base } from '@playwright/test';
import { MapsFixtureManager } from './maps.fixture';
import { AuthFixtureManager, createTestUser, deleteTestUser } from './auth.fixture';
import { TripsFixtureManager } from './trips.fixture';
import { MockMapsState, createDefaultMockState, TestUser } from './types';
import { MapMarkerRpc } from '@/lib/types';

/**
 * Composite Mock Manager coordinating modular route fixtures.
 * Implements the full MockMapsManager interface for 100% backward compatibility.
 */
export class CompositeMockMapsManager {
  public maps: MapsFixtureManager;
  public auth: AuthFixtureManager;
  public trips: TripsFixtureManager;

  constructor(
    public page: Page, 
    state?: MockMapsState, 
    workerIndex: number = 0
  ) {
    const sharedState = state || createDefaultMockState();
    this.maps = new MapsFixtureManager(page, workerIndex);
    this.auth = new AuthFixtureManager(page);
    this.trips = new TripsFixtureManager(page, sharedState);
  }

  setupLogging() {
    this.maps.setupLogging();
  }

  flushDiagnosticLogs() {
    this.maps.flushDiagnosticLogs();
  }

  getState(): MockMapsState {
    return this.trips.getState();
  }

  get state(): MockMapsState {
    return this.trips.getState();
  }

  get currentUserId(): string {
    return this.auth.getCurrentUserId();
  }
  set currentUserId(id: string) {
    this.auth.setCurrentUserId(id);
    this.trips.setCurrentUserId(id);
  }

  get userProfilesState() {
    return this.auth.getUserProfilesState();
  }

  get swEnabled(): boolean {
    return this.maps.isServiceWorkerEnabled();
  }

  get workerIndex(): number {
    return this.maps.getWorkerIndex();
  }

  getEquivalentWineryIds(rawId: string | number | undefined | null, markersList: MapMarkerRpc[] = []): string[] {
    return this.maps.getEquivalentWineryIds(rawId, markersList);
  }

  enableServiceWorker() {
    this.maps.enableServiceWorker();
  }

  async failMarkers() {
    await this.maps.failMarkers();
  }

  async failTrips() {
    await this.trips.failTrips();
  }

  async failLogin() {
    await this.auth.failLogin();
  }

  async mockPlacesV1() {
    await this.maps.mockPlacesV1();
  }

  get realSocialEnabled(): boolean {
    return this.trips.realSocialEnabled;
  }
  set realSocialEnabled(val: boolean) {
    this.trips.realSocialEnabled = val;
  }

  get realFavoritesEnabled(): boolean {
    return this.trips.realFavoritesEnabled;
  }
  set realFavoritesEnabled(val: boolean) {
    this.trips.realFavoritesEnabled = val;
  }

  get realVisitsEnabled(): boolean {
    return this.trips.realVisitsEnabled;
  }
  set realVisitsEnabled(val: boolean) {
    this.trips.realVisitsEnabled = val;
  }

  get realTripsEnabled(): boolean {
    return this.trips.realTripsEnabled;
  }
  set realTripsEnabled(val: boolean) {
    this.trips.realTripsEnabled = val;
  }

  async useRealSocial() {
    await this.trips.useRealSocial();
  }

  async useRealFavorites() {
    await this.trips.useRealFavorites();
  }

  async useRealVisits() {
    await this.trips.useRealVisits();
  }

  async useRealTrips() {
    await this.trips.useRealTrips();
  }

  async initDefaultMocks(options: { currentUserId?: string, forceMocks?: boolean } = {}) {
    const isRealData = process.env.E2E_REAL_DATA === 'true';

    if (options.currentUserId) {
      this.auth.setCurrentUserId(options.currentUserId);
      this.trips.setCurrentUserId(options.currentUserId);
    }

    await this.maps.mockPlacesV1();
    await this.maps.setupWebGLAndMapMocks();
    await this.auth.registerMockRoutes({ 
      currentUserId: options.currentUserId, 
      realSocialEnabled: this.trips.realSocialEnabled 
    });
    await this.trips.registerMockRoutes({ currentUserId: options.currentUserId });

    if (isRealData && !options.forceMocks) {
      this.trips.realSocialEnabled = true;
      this.trips.realFavoritesEnabled = true;
      this.trips.realVisitsEnabled = true;
      this.trips.realTripsEnabled = true;
    } else if (options.forceMocks) {
      this.trips.realSocialEnabled = false;
      this.trips.realFavoritesEnabled = false;
      this.trips.realVisitsEnabled = false;
      this.trips.realTripsEnabled = false;
    }

    // Proactive store mock injection
    await this.page.addInitScript(({ realFavoritesEnabled, realVisitsEnabled, realTripsEnabled }: any) => {
      window._E2E_MOCKS_ACTIVE = true;
      if (realFavoritesEnabled || realVisitsEnabled || realTripsEnabled) {
        window._E2E_ENABLE_REAL_SYNC = true;
      }
    }, {
      realFavoritesEnabled: this.trips.realFavoritesEnabled,
      realVisitsEnabled: this.trips.realVisitsEnabled,
      realTripsEnabled: this.trips.realTripsEnabled
    });
  }
}

export const test = base.extend<{
  mockMaps: CompositeMockMapsManager;
  user: TestUser;
  user2: TestUser;
}>({
  baseURL: async ({}, use) => {
    await use('http://127.0.0.1:3001');
  },

  storageState: async ({}, use, testInfo) => {
    const partition = path.join(process.cwd(), `test-results/.storage/worker-${testInfo.workerIndex}.json`);
    const dir = path.dirname(partition);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(partition)) {
      fs.writeFileSync(partition, JSON.stringify({ cookies: [], origins: [] }, null, 2));
    }
    await use(partition);
  },

  mockMaps: [async ({ page }, use, testInfo) => {
    const state = createDefaultMockState();
    const manager = new CompositeMockMapsManager(page, state, testInfo.workerIndex);
    if (testInfo.file.includes('pwa-')) { manager.enableServiceWorker(); }
    
    manager.setupLogging();
    await manager.initDefaultMocks();
    await use(manager);

    if (testInfo.status !== testInfo.expectedStatus) {
      manager.flushDiagnosticLogs();
    }
  }, { auto: true }],

  user: async ({}, use) => {
    const testUser = await createTestUser();
    await use(testUser);
    await deleteTestUser(testUser.id);
  },

  user2: async ({}, use) => {
    const testUser = await createTestUser();
    await use(testUser);
    await deleteTestUser(testUser.id);
  }
});

export { expect } from '@playwright/test';

export { CompositeMockMapsManager as MockMapsManager };
export { createMockTrip, createMockVisitWithWinery, createMockMapMarkerRpc } from '@/lib/test-utils/fixtures';

// Re-export modular managers and types
export { MapsFixtureManager, mapsFixture } from './maps.fixture';
export { AuthFixtureManager, authFixture, getAdminClient, supabase, createTestUser, deleteTestUser } from './auth.fixture';
export { TripsFixtureManager, tripsFixture } from './trips.fixture';
export { TripsHandler } from './handlers/trips.handler';
export { VisitsHandler } from './handlers/visits.handler';
export { SocialHandler } from './handlers/social.handler';
export { FavoritesHandler } from './handlers/favorites.handler';
export { PlacesHandler } from './handlers/places.handler';
export { AssetsHandler } from './handlers/assets.handler';
export * from './types';

/** @deprecated Use mockMaps fixture */
export async function mockGoogleMapsApi(page: Page, userId?: string, forceMocks: boolean = false) {
  const manager = new CompositeMockMapsManager(page);
  await manager.initDefaultMocks({ currentUserId: userId, forceMocks });
}
