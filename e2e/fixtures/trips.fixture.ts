/* eslint-disable react-hooks/rules-of-hooks */
import { Page } from '@playwright/test';
import { MapMarkerRpc } from '@/lib/types';
import { MockMapsState, createDefaultMockState } from './types';
import { getEquivalentWineryIds } from './utils/mock-wineries';
import { TripsHandler } from './handlers/trips.handler';
import { VisitsHandler } from './handlers/visits.handler';
import { SocialHandler } from './handlers/social.handler';
import { FavoritesHandler } from './handlers/favorites.handler';

export class TripsFixtureManager {
  private tripsHandler: TripsHandler;
  private visitsHandler: VisitsHandler;
  private socialHandler: SocialHandler;
  private favoritesHandler: FavoritesHandler;

  constructor(page: Page, state?: MockMapsState) {
    const sharedState = state || createDefaultMockState();
    this.tripsHandler = new TripsHandler(page, sharedState);
    this.visitsHandler = new VisitsHandler(page, sharedState);
    this.socialHandler = new SocialHandler(page, sharedState, () => this.realVisitsEnabled);
    this.favoritesHandler = new FavoritesHandler(page, sharedState, () => this.realVisitsEnabled);
  }

  getState(): MockMapsState { return this.tripsHandler.getState(); }

  get realTripsEnabled(): boolean { return this.tripsHandler.realTripsEnabled; }
  set realTripsEnabled(val: boolean) { this.tripsHandler.realTripsEnabled = val; }

  get realVisitsEnabled(): boolean { return this.visitsHandler.realVisitsEnabled; }
  set realVisitsEnabled(val: boolean) { this.visitsHandler.realVisitsEnabled = val; }

  get realSocialEnabled(): boolean { return this.socialHandler.realSocialEnabled; }
  set realSocialEnabled(val: boolean) { this.socialHandler.realSocialEnabled = val; }

  get realFavoritesEnabled(): boolean { return this.favoritesHandler.realFavoritesEnabled; }
  set realFavoritesEnabled(val: boolean) { this.favoritesHandler.realFavoritesEnabled = val; }

  async useRealTrips() { await this.tripsHandler.useRealTrips(); }
  async useRealVisits() { await this.visitsHandler.useRealVisits(); }
  async useRealSocial() { await this.socialHandler.useRealSocial(); }
  async useRealFavorites() { await this.favoritesHandler.useRealFavorites(); }
  async failTrips() { await this.tripsHandler.failTrips(); }

  setCurrentUserId(id: string) {
    this.tripsHandler.setCurrentUserId(id);
    this.visitsHandler.setCurrentUserId(id);
    this.socialHandler.setCurrentUserId(id);
    this.favoritesHandler.setCurrentUserId(id);
  }

  getEquivalentWineryIds(rawId: string | number | undefined | null, markersList?: MapMarkerRpc[]): string[] {
    return getEquivalentWineryIds(rawId, markersList);
  }

  initDefaultState() {
    this.tripsHandler.initDefaultState();
    this.visitsHandler.initDefaultState();
  }

  async registerMockRoutes(options: { currentUserId?: string } = {}) {
    if (options.currentUserId) {
      this.setCurrentUserId(options.currentUserId);
    }
    this.initDefaultState();
    await this.tripsHandler.registerRoutes();
    await this.visitsHandler.registerRoutes();
    await this.socialHandler.registerRoutes();
    await this.favoritesHandler.registerRoutes();
  }
}

export const tripsFixture = async ({ page }: { page: Page }, use: (m: TripsFixtureManager) => Promise<void>) => {
  const manager = new TripsFixtureManager(page);
  await manager.registerMockRoutes();
  await use(manager);
};
