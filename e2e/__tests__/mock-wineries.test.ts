import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { MapMarkerRpc } from '@/lib/types';

/**
 * Phase 7 Task 1 (Red Phase): Canonical Mock Wineries & ID Normalization Tests
 * 
 * Verifies:
 * 1. Existence and Module Contract for e2e/fixtures/utils/mock-wineries.ts
 * 2. Canonical MOCK_MARKERS Consistency and Geographic Invariants
 * 3. Canonical getEquivalentWineryIds Normalization and Aliasing
 * 4. Coordinate Extraction Helper Contract (markerLat, markerLng)
 */
test.describe('Mock Wineries & ID Normalization Contract (Phase 7)', () => {
  const utilsDir = path.resolve(__dirname, '../fixtures/utils');
  const mockWineriesFile = path.join(utilsDir, 'mock-wineries.ts');

  test.describe('Module Structure Contract', () => {
    test('e2e/fixtures/utils/mock-wineries.ts exists and satisfies contract', async () => {
      expect(fs.existsSync(mockWineriesFile), 'mock-wineries.ts must exist under e2e/fixtures/utils/').toBe(true);

      if (fs.existsSync(mockWineriesFile)) {
        const mod = await import(mockWineriesFile);
        expect(mod.MOCK_MARKERS).toBeDefined();
        expect(mod.getEquivalentWineryIds).toBeDefined();
        expect(typeof mod.getEquivalentWineryIds).toBe('function');
      }
    });
  });

  test.describe('Canonical MOCK_MARKERS Consistency Contract', () => {
    test('MOCK_MARKERS contains exactly 3 canonical markers with valid properties', async () => {
      if (!fs.existsSync(mockWineriesFile)) {
        test.skip(!fs.existsSync(mockWineriesFile), 'mock-wineries.ts not yet implemented');
        return;
      }

      const { MOCK_MARKERS }: { MOCK_MARKERS: MapMarkerRpc[] } = await import(mockWineriesFile);
      expect(Array.isArray(MOCK_MARKERS)).toBe(true);
      expect(MOCK_MARKERS.length).toBe(3);

      // Winery 1
      const w1 = MOCK_MARKERS.find(m => Number(m.id) === 1);
      expect(w1).toBeDefined();
      expect(w1?.google_place_id).toBe('ch-12345-mock-winery-1');
      expect(w1?.name).toBe('Mock Winery One');
      expect(w1?.address).toContain('123 Vineyard Way');
      expect(typeof w1?.latitude).toBe('number');
      expect(typeof w1?.longitude).toBe('number');
      expect(w1?.google_rating).toBeGreaterThan(0);

      // Winery 2
      const w2 = MOCK_MARKERS.find(m => Number(m.id) === 2);
      expect(w2).toBeDefined();
      expect(w2?.google_place_id).toBe('ch-67890-mock-winery-2');
      expect(w2?.name).toBe('Vineyard of Illusion');
      expect(w2?.address).toContain('456 Mirage Ln');
      expect(typeof w2?.latitude).toBe('number');
      expect(typeof w2?.longitude).toBe('number');
      expect(w2?.google_rating).toBeGreaterThan(0);

      // Winery 3
      const w3 = MOCK_MARKERS.find(m => Number(m.id) === 3);
      expect(w3).toBeDefined();
      expect(w3?.google_place_id).toBe('ch-abcde-mock-winery-3');
      expect(w3?.name).toBe('The Phantom Cellar');
      expect(w3?.address).toContain('789 Ethereal Rd');
      expect(typeof w3?.latitude).toBe('number');
      expect(typeof w3?.longitude).toBe('number');
      expect(w3?.google_rating).toBeGreaterThan(0);
    });

    test('MOCK_MARKERS coordinates fall within Finger Lakes geographic bounds', async () => {
      if (!fs.existsSync(mockWineriesFile)) {
        test.skip(!fs.existsSync(mockWineriesFile), 'mock-wineries.ts not yet implemented');
        return;
      }

      const { MOCK_MARKERS } = await import(mockWineriesFile);
      for (const marker of MOCK_MARKERS) {
        // Finger Lakes Region: Latitude ~42.0 to ~43.5, Longitude ~-77.5 to ~-76.0
        expect(marker.latitude).toBeGreaterThanOrEqual(42.0);
        expect(marker.latitude).toBeLessThanOrEqual(43.5);
        expect(marker.longitude).toBeGreaterThanOrEqual(-77.5);
        expect(marker.longitude).toBeLessThanOrEqual(-76.0);
      }
    });
  });

  test.describe('Canonical getEquivalentWineryIds Normalization Contract', () => {
    test('returns default canonical aliases when input is null, undefined, or empty', async () => {
      if (!fs.existsSync(mockWineriesFile)) {
        test.skip(!fs.existsSync(mockWineriesFile), 'mock-wineries.ts not yet implemented');
        return;
      }

      const { getEquivalentWineryIds } = await import(mockWineriesFile);
      const defaultAliases = ['ch-12345-mock-winery-1', '1', '999123'];

      expect(getEquivalentWineryIds(undefined)).toEqual(expect.arrayContaining(defaultAliases));
      expect(getEquivalentWineryIds(null)).toEqual(expect.arrayContaining(defaultAliases));
      expect(getEquivalentWineryIds('')).toEqual(expect.arrayContaining(defaultAliases));
    });

    test('normalizes winery 1 aliases consistently', async () => {
      if (!fs.existsSync(mockWineriesFile)) {
        test.skip(!fs.existsSync(mockWineriesFile), 'mock-wineries.ts not yet implemented');
        return;
      }

      const { getEquivalentWineryIds, MOCK_MARKERS } = await import(mockWineriesFile);
      const expected = ['ch-12345-mock-winery-1', '1', '999123'];

      expect(getEquivalentWineryIds('1', MOCK_MARKERS)).toEqual(expect.arrayContaining(expected));
      expect(getEquivalentWineryIds(1, MOCK_MARKERS)).toEqual(expect.arrayContaining(expected));
      expect(getEquivalentWineryIds('ch-12345-mock-winery-1', MOCK_MARKERS)).toEqual(expect.arrayContaining(expected));
      expect(getEquivalentWineryIds('999123', MOCK_MARKERS)).toEqual(expect.arrayContaining(expected));
    });

    test('normalizes winery 2 and winery 3 aliases from marker list', async () => {
      if (!fs.existsSync(mockWineriesFile)) {
        test.skip(!fs.existsSync(mockWineriesFile), 'mock-wineries.ts not yet implemented');
        return;
      }

      const { getEquivalentWineryIds, MOCK_MARKERS } = await import(mockWineriesFile);

      const winery2Ids = getEquivalentWineryIds('ch-67890-mock-winery-2', MOCK_MARKERS);
      expect(winery2Ids).toContain('ch-67890-mock-winery-2');
      expect(winery2Ids).toContain('2');

      const winery3Ids = getEquivalentWineryIds('ch-abcde-mock-winery-3', MOCK_MARKERS);
      expect(winery3Ids).toContain('ch-abcde-mock-winery-3');
      expect(winery3Ids).toContain('3');
    });

    test('passes through unknown winery IDs and deduplicates results', async () => {
      if (!fs.existsSync(mockWineriesFile)) {
        test.skip(!fs.existsSync(mockWineriesFile), 'mock-wineries.ts not yet implemented');
        return;
      }

      const { getEquivalentWineryIds, MOCK_MARKERS } = await import(mockWineriesFile);

      const unknownResult = getEquivalentWineryIds('custom-place-xyz', MOCK_MARKERS);
      expect(unknownResult).toEqual(['custom-place-xyz']);

      // Deduplication check
      const w1Ids = getEquivalentWineryIds('1', MOCK_MARKERS);
      const uniqueW1Ids = Array.from(new Set(w1Ids));
      expect(w1Ids.length).toBe(uniqueW1Ids.length);
    });
  });

  test.describe('Coordinate Extraction Helpers Contract', () => {
    test('markerLat and markerLng return numeric coordinates with valid fallbacks', async () => {
      if (!fs.existsSync(mockWineriesFile)) {
        test.skip(!fs.existsSync(mockWineriesFile), 'mock-wineries.ts not yet implemented');
        return;
      }

      const { markerLat, markerLng, MOCK_MARKERS } = await import(mockWineriesFile);
      expect(typeof markerLat).toBe('function');
      expect(typeof markerLng).toBe('function');

      const marker = MOCK_MARKERS[0];
      expect(markerLat(marker)).toBe(marker.latitude);
      expect(markerLng(marker)).toBe(marker.longitude);

      // Fallback behavior on empty/missing coordinates
      const emptyMarker = { id: 99, name: 'Empty Marker' } as unknown as MapMarkerRpc;
      expect(markerLat(emptyMarker)).toBe(42.5);
      expect(markerLng(emptyMarker)).toBe(-76.8);
    });
  });
});
