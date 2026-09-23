import { Page } from '@playwright/test';

export class AssetsHandler {
  constructor(private page: Page) {}

  /**
   * Registers route interceptions for static assets, tiles, fonts, weather, and Mapbox resources.
   */
  async registerRoutes() {
    // 1. Open-Meteo Weather API Mock
    await this.page.context().route(/api\.open-meteo\.com\/v1\/forecast.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          current: {
            temperature_2m: 72,
            relative_humidity_2m: 50,
            weather_code: 1,
            wind_speed_10m: 5,
          },
        }),
      });
    });

    // 2. Google Maps Tiles Handler
    await this.page.context().route(/google\.com\/maps\/vt\/tile|google\.com\/vt\/tile/, async (route) => {
      return route.fulfill({
        contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAghjYAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
      });
    });

    // 3. Google Fonts Handler
    await this.page.context().route(/fonts\.(googleapis|gstatic)\.com/, async (route) => {
      const type = route.request().resourceType();
      if (type === 'font' || type === 'stylesheet') {
        return route.fulfill({ status: 200, contentType: type === 'font' ? 'font/woff2' : 'text/css', body: '' });
      }
      return route.fallback();
    });

    // 4. Mapbox Styles Handler
    await this.page.context().route(/api\.mapbox\.com\/styles\/v1/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          version: 8,
          sources: {},
          layers: [],
          glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
        }),
      });
    });

    // 5. Mapbox Fonts Handler
    await this.page.context().route(/api\.mapbox\.com\/fonts\/v1/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/x-protobuf',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: Buffer.alloc(0),
      });
    });

    // 6. Mapbox Sprites Handler
    await this.page.context().route(/api\.mapbox\.com\/sprites\/v1/, async (route) => {
      if (route.request().url().endsWith('.json')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: '{}',
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'image/png',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: Buffer.from('iVBORw0KGgoAAAghjYAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
        });
      }
    });

    // 7. Mapbox Tiles Handler
    await this.page.context().route(/(api\.mapbox\.com\/v4\/|\.tiles\.mapbox\.com)/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: Buffer.from('iVBORw0KGgoAAAghjYAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
      });
    });
  }
}
