/**
 * Proactively check the storage quota and purge caches if a threshold is exceeded.
 * Following "The Quota Resilience Rule" in GEMINI.md.
 */
export const checkAndCleanupQuota = async (threshold = 0.8) => {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) {
    return;
  }

  try {
    const estimate = await navigator.storage.estimate();
    const { usage, quota } = estimate;

    if (usage !== undefined && quota !== undefined && quota > 0 && usage / quota > threshold) {
      console.warn(`[Quota] Storage usage is high (${Math.round((usage / quota) * 100)}%). Purging non-essential caches.`);
      
      const cachesToClear = ["google-maps-tiles", "pages", "supabase-storage"];
      const keys = await caches.keys();
      
      await Promise.all(
        keys.filter((key) => {
          return cachesToClear.some((c) => key.includes(c));
        }).map((key) => {
          console.log("[Quota] Proactively deleting cache: " + key);
          return caches.delete(key);
        })
      );
    }
  } catch (err) {
    console.error("[Quota] Failed to check or cleanup quota:", err);
  }
};
