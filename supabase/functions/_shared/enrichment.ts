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
  
  // Auto-heal if reviews are missing or in the old unnormalized V1 format (object text)
  if (winery.reviews === null || winery.reviews === undefined) return true;
  if (Array.isArray(winery.reviews) && winery.reviews.length > 0) {
    const firstReview = winery.reviews[0];
    // If the review text is an object, it's the old unnormalized V1 format
    if (typeof firstReview.text === 'object' && firstReview.text !== null) return true;
    // If it's missing the author_name field (Legacy format)
    if (!firstReview.author_name && firstReview.authorAttribution) return true;
  }

  // Auto-heal if user_rating_count is missing (newly added field)
  if (winery.user_rating_count === null || winery.user_rating_count === undefined) return true;

  // Auto-heal if critical enrichment data is missing despite being in 'enriched' tier
  if (!winery.generative_summary || !winery.primary_photo_reference) return true;
  
  return isStale(winery.last_enriched_at);
}
