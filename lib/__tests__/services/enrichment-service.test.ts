import { EnrichmentService } from '../../services/enrichment-service';

describe('EnrichmentService', () => {
  describe('isStale', () => {
    it('should return true if lastEnrichedAt is null', () => {
      expect(EnrichmentService.isStale(null)).toBe(true);
    });

    it('should return true if lastEnrichedAt is undefined', () => {
      expect(EnrichmentService.isStale(undefined)).toBe(true);
    });

    it('should return true if lastEnrichedAt is more than 30 days ago', () => {
      const fortyDaysAgo = new Date();
      fortyDaysAgo.setDate(fortyDaysAgo.getDate() - 40);
      expect(EnrichmentService.isStale(fortyDaysAgo.toISOString())).toBe(true);
    });

    it('should return false if lastEnrichedAt is less than 30 days ago', () => {
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      expect(EnrichmentService.isStale(tenDaysAgo.toISOString())).toBe(false);
    });

    it('should return false if lastEnrichedAt is exactly today', () => {
      expect(EnrichmentService.isStale(new Date().toISOString())).toBe(false);
    });
  });
});
