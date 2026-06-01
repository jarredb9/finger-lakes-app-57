/**
 * Shared logic for enrichment and data freshness.
 */

export const STALE_THRESHOLD_DAYS = 30;

/**
 * Checks if a record is stale based on its last enrichment timestamp.
 */
export function isStale(lastEnrichedAt?: string | null): boolean {
  if (!lastEnrichedAt) return true;
  
  const lastDate = new Date(lastEnrichedAt);
  if (isNaN(lastDate.getTime())) return true;
  
  const diffTime = Math.abs(new Date().getTime() - lastDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays > STALE_THRESHOLD_DAYS;
}

/**
 * Determines if a winery record should be enriched based on its tier and staleness.
 */
export function shouldEnrich(winery: any): boolean {
  if (!winery) return true;
  if (winery.enrichment_tier !== 'enriched') return true;
  return isStale(winery.last_enriched_at);
}
