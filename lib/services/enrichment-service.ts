/**
 * EnrichmentService
 * 
 * Centralized logic for managing data freshness and enrichment status
 * for wineries and regions.
 */
export class EnrichmentService {
  private static readonly STALE_THRESHOLD_DAYS = 30;

  /**
   * Checks if the data is stale based on the last enrichment timestamp.
   * Data is considered stale if it has never been enriched or if the
   * last enrichment was more than 30 days ago.
   * 
   * @param lastEnrichedAt ISO 8601 timestamp of the last enrichment
   * @returns true if the data is stale or missing, false otherwise
   */
  static isStale(lastEnrichedAt?: string | null): boolean {
    if (!lastEnrichedAt) {
      return true;
    }

    const lastDate = new Date(lastEnrichedAt);
    if (isNaN(lastDate.getTime())) {
      return true;
    }

    const now = new Date();
    const diffTime = Math.abs(now.getTime() - lastDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays > this.STALE_THRESHOLD_DAYS;
  }
}
