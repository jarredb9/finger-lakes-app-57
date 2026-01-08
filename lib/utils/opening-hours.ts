import { OpeningHours } from "@/lib/types";

// Helper to get time as integer (e.g. 1430) from a point that might be { hour, minute } OR { time: "1430" }
function parseTime(point: any): number {
  if (typeof point.hour === 'number' && typeof point.minute === 'number') {
    return point.hour * 100 + point.minute;
  }
  if (typeof point.time === 'string') {
    return parseInt(point.time, 10);
  }
  return NaN;
}

/**
 * Determines if a business is currently open based on its OpeningHours periods.
 * Falls back to 'open_now' property if periods are missing (though this may be stale).
 */
export function isOpenNow(openingHours: OpeningHours | null | undefined): boolean | null {
  if (!openingHours) return null;

  // 1. If we have periods, calculate dynamically (Trusted Source)
  if (openingHours.periods && openingHours.periods.length > 0) {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTime = currentHours * 100 + currentMinutes; // e.g., 1430 for 2:30 PM

    // Check if open 24/7 (single period, day 0, time 0000, no close)
    // Note: Use 'any' cast or robust check because DB JSON might differ from TS types
    const firstPeriod = openingHours.periods[0] as any;
    if (openingHours.periods.length === 1 && 
        firstPeriod.open.day === 0 && 
        (parseTime(firstPeriod.open) === 0) &&
        !firstPeriod.close) {
      return true;
    }

    // Iterate through all periods to see if 'now' falls inside any of them
    for (const period of openingHours.periods) {
      const open = period.open as any;
      const close = period.close as any;

      if (!close) continue; // Should have a close time unless 24/7 (handled above)

      const openTime = parseTime(open);
      const closeTime = parseTime(close);

      if (isNaN(openTime) || isNaN(closeTime)) continue;

      // Case A: Standard Intraday (e.g., 10:00 to 17:00 on Monday)
      if (open.day === close.day) {
        if (currentDay === open.day) {
          if (currentTime >= openTime && currentTime < closeTime) {
            return true;
          }
        }
      } 
      // Case B: Spans Midnight (e.g., Sat 20:00 to Sun 02:00)
      else {
        // Current time is on the "Start Day" (after open time)
        if (currentDay === open.day && currentTime >= openTime) {
          return true;
        }
        // Current time is on the "End Day" (before close time)
        if (currentDay === close.day && currentTime < closeTime) {
          return true;
        }
      }
    }

    return false; // Not found in any open period
  }

  // 2. Fallback: If no periods, we cannot determine status reliably.
  // Do NOT use open_now as it is a static snapshot from fetch time.
  return null;
}
