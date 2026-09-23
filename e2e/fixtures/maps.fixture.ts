/* eslint-disable react-hooks/rules-of-hooks */
import { Page } from '@playwright/test';
import { MapMarkerRpc } from '@/lib/types';
import { DiagnosticLogger } from './utils/diagnostic-logger';
import { getEquivalentWineryIds } from './utils/mock-wineries';
import { BrowserShim } from './shims/browser.shim';
import { GoogleMapsSdkShim } from './shims/google-maps-sdk.shim';
import { PlacesHandler } from './handlers/places.handler';
import { AssetsHandler } from './handlers/assets.handler';

/**
 * Lightweight orchestrator coordinating browser shims, diagnostic logging, and maps route handlers.
 */
export class MapsFixtureManager {
  private swEnabled = false;
  private workerIndex: number;
  private logger: DiagnosticLogger;
  private browserShim: BrowserShim;
  private placesHandler: PlacesHandler;
  private assetsHandler: AssetsHandler;
  private googleMapsSdkShim: GoogleMapsSdkShim;

  constructor(page: Page, workerIndex: number = 0) {
    this.workerIndex = workerIndex;
    this.logger = new DiagnosticLogger(page);
    this.browserShim = new BrowserShim(page);
    this.placesHandler = new PlacesHandler(page);
    this.assetsHandler = new AssetsHandler(page);
    this.googleMapsSdkShim = new GoogleMapsSdkShim(page);
  }

  enableServiceWorker() { this.swEnabled = true; }
  isServiceWorkerEnabled(): boolean { return this.swEnabled; }
  getWorkerIndex(): number { return this.workerIndex; }

  flushDiagnosticLogs() { this.logger.flushDiagnosticLogs(); }
  setupLogging() { this.logger.setupLogging(); }

  getEquivalentWineryIds(rawId: string | number | undefined | null, markersList?: MapMarkerRpc[]): string[] {
    return getEquivalentWineryIds(rawId, markersList);
  }

  async failMarkers() {
    await this.browserShim.failMarkers();
  }

  async mockPlacesV1() {
    await this.placesHandler.registerRoutes();
    await this.assetsHandler.registerRoutes();
    await this.googleMapsSdkShim.registerRoutes();
  }

  async setupWebGLAndMapMocks() {
    await this.browserShim.setupWebGLAndMapMocks({
      swEnabled: this.swEnabled,
      workerIndex: this.workerIndex,
    });
  }
}

export const mapsFixture = async ({ page }: { page: Page }, use: (m: MapsFixtureManager) => Promise<void>) => {
  const manager = new MapsFixtureManager(page);
  await manager.mockPlacesV1();
  await manager.setupWebGLAndMapMocks();
  await use(manager);
};
