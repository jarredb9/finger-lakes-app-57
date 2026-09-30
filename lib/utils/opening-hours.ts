import { OpeningHours, OpeningHoursPoint } from "@/lib/types";

/**
 * Helper to get time as integer (e.g. 1430) from a point that might be { hour, minute } OR { time: "1430" }.
 * Safely returns NaN on nullish, primitive, or malformed points without throwing TypeError.
 */
export function parseTime(point?: OpeningHoursPoint | null): number {
  if (!point || typeof point !== 'object') {
    return NaN;
  }

  if (typeof point.hour === 'number' && typeof point.minute === 'number' && !isNaN(point.hour) && !isNaN(point.minute)) {
    return point.hour * 100 + point.minute;
  }

  if (typeof point.time === 'string' && point.time.trim().length > 0) {
    const parsed = parseInt(point.time, 10);
    return isNaN(parsed) ? NaN : parsed;
  }

  return NaN;
}

/**
 * Determines if a business is currently open based on its OpeningHours periods.
 * Falls back to 'open_now' property if periods are missing (though this may be stale).
 */
export function isOpenNow(openingHours: OpeningHours | null | undefined): boolean | null {
  if (!openingHours || typeof openingHours !== 'object') return null;

  // 1. If we have periods, calculate dynamically (Trusted Source)
  if (Array.isArray(openingHours.periods) && openingHours.periods.length > 0) {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTime = currentHours * 100 + currentMinutes; // e.g., 1430 for 2:30 PM

    // Check if open 24/7 (single period, day 0, time 0000, no close)
    const firstPeriod = openingHours.periods[0];
    if (
      openingHours.periods.length === 1 &&
      firstPeriod?.open &&
      typeof firstPeriod.open.day === 'number' &&
      firstPeriod.open.day === 0 &&
      parseTime(firstPeriod.open) === 0 &&
      !firstPeriod.close
    ) {
      return true;
    }

    // Iterate through all periods to see if 'now' falls inside any of them
    for (const period of openingHours.periods) {
      if (!period?.open || !period?.close) continue;

      const open = period.open;
      const close = period.close;

      if (typeof open.day !== 'number' || typeof close.day !== 'number') continue;

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

const DAY_VARIANTS: Record<number, readonly string[]> = {
  0: ['sunday', 'sundays', 'sun'],
  1: ['monday', 'mondays', 'mon'],
  2: ['tuesday', 'tuesdays', 'tue', 'tues'],
  3: ['wednesday', 'wednesdays', 'wed', 'weds'],
  4: ['thursday', 'thursdays', 'thu', 'thur', 'thurs'],
  5: ['friday', 'fridays', 'fri'],
  6: ['saturday', 'saturdays', 'sat'],
};

/**
 * Returns the day index (0 = Sun, 1 = Mon, ..., 6 = Sat) if the given token is a known day name or abbreviation.
 */
export function getDayIndex(word: string): number | null {
  if (!word || typeof word !== 'string') return null;
  const cleaned = word.trim().toLowerCase().replace(/[.,]$/, '');
  for (const [dayIdx, variants] of Object.entries(DAY_VARIANTS)) {
    if (variants.includes(cleaned)) {
      return Number(dayIdx);
    }
  }
  return null;
}

/**
 * Checks if a given text line or day label matches the day of the week for targetDate.
 * Supports full day names ("Monday"), 3-letter prefixes ("Mon"), abbreviations ("Tues", "Thurs"),
 * and day ranges (e.g. "Mon-Fri", "Monday – Friday").
 */
export function isDayForDate(dayOrLine: string, targetDate: Date = new Date()): boolean {
  if (!dayOrLine || typeof dayOrLine !== 'string') return false;
  if (!targetDate || !(targetDate instanceof Date) || isNaN(targetDate.getTime())) return false;

  const targetDay = targetDate.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat

  const colonIndex = dayOrLine.indexOf(':');
  let label = dayOrLine.trim();
  if (colonIndex !== -1) {
    const beforeColon = dayOrLine.substring(0, colonIndex).trim();
    if (!/\d/.test(beforeColon)) {
      label = beforeColon;
    }
  }

  // 1. Direct single-token match
  const singleMatch = getDayIndex(label);
  if (singleMatch !== null) {
    return singleMatch === targetDay;
  }

  // 2. Day range match (e.g., "Mon-Fri", "Monday - Friday", "Monday to Friday")
  const rangeMatch = label.match(
    /^([a-zA-Z]+)\.?\s*(?:-|–|—|\bto\b|\bthru\b|\bthrough\b)\s*([a-zA-Z]+)\.?$/i
  );
  if (rangeMatch) {
    const startDay = getDayIndex(rangeMatch[1]);
    const endDay = getDayIndex(rangeMatch[2]);
    if (startDay !== null && endDay !== null) {
      if (startDay <= endDay) {
        return targetDay >= startDay && targetDay <= endDay;
      } else {
        // Wraparound range (e.g. Friday to Monday)
        return targetDay >= startDay || targetDay <= endDay;
      }
    }
  }

  // 3. Match if the first token is a day name followed by delimiter or qualifier (e.g., "Monday Morning")
  const firstWordMatch = label.match(/^([a-zA-Z]+)\b/);
  if (firstWordMatch) {
    const firstDay = getDayIndex(firstWordMatch[1]);
    if (firstDay !== null) {
      return firstDay === targetDay;
    }
  }

  return false;
}

/**
 * Safely extracts the hours portion from a weekday_text line.
 * Handles "Day: Hours", "Day Hours", or plain "Hours" safely.
 * Returns null if the line has no hours or is only a day name.
 */
export function extractHours(line: string): string | null {
  if (!line || typeof line !== 'string') return null;
  const trimmed = line.trim();
  if (!trimmed) return null;

  // If the line is only a day name (e.g. "Monday", "Mon."), no hours are provided
  if (getDayIndex(trimmed) !== null) {
    return null;
  }

  const colonIndex = trimmed.indexOf(':');
  if (colonIndex !== -1) {
    const beforeColon = trimmed.substring(0, colonIndex).trim();
    // If the part before colon does NOT contain digits, it is a day label (e.g. "Monday: ...")
    if (!/\d/.test(beforeColon)) {
      const hours = trimmed.substring(colonIndex + 1).trim();
      return hours.length > 0 ? hours : null;
    }
  }

  // If no day colon (or colon was part of time), check if line starts with a day name
  const dayNameMatch = trimmed.match(
    /^(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sun|Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat)\.?\s*[:-]?\s*(.+)$/i
  );
  if (dayNameMatch && dayNameMatch[1]) {
    const hours = dayNameMatch[1].trim();
    return hours.length > 0 ? hours : null;
  }

  return trimmed;
}

/**
 * Retrieves the daily hours string for a specific date from OpeningHours.
 * Supports full day names ("Monday"), 3-letter abbreviations ("Mon"), day ranges ("Mon-Fri"),
 * positional fallback ONLY when weekday_text has exactly 7 entries,
 * and safe extraction of hours without throwing runtime TypeErrors.
 */
export function getDailyHoursForDate(
  openingHours: OpeningHours | null | undefined,
  targetDate: Date = new Date()
): string | null {
  if (!openingHours || typeof openingHours !== 'object') return null;
  if (!Array.isArray(openingHours.weekday_text) || openingHours.weekday_text.length === 0) {
    return null;
  }
  if (!targetDate || !(targetDate instanceof Date) || isNaN(targetDate.getTime())) {
    return null;
  }

  const dayOfWeek = targetDate.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat

  // 1. Search for a matching entry by day name, abbreviation, or range
  const matchedLine = openingHours.weekday_text.find(
    (line) => typeof line === 'string' && isDayForDate(line, targetDate)
  );

  if (matchedLine) {
    return extractHours(matchedLine);
  }

  // 2. Positional fallback ONLY when exactly 7 entries exist
  // Standard Google Places API weekday_text order: Monday (0) to Sunday (6)
  if (openingHours.weekday_text.length === 7) {
    const mondayBasedIndex = (dayOfWeek + 6) % 7;
    const fallbackLine = openingHours.weekday_text[mondayBasedIndex];
    if (typeof fallbackLine === 'string') {
      // If fallbackLine explicitly has a day label for another day, reject positional fallback
      const colonIdx = fallbackLine.indexOf(':');
      const label = colonIdx !== -1 && !/\d/.test(fallbackLine.substring(0, colonIdx))
        ? fallbackLine.substring(0, colonIdx).trim()
        : fallbackLine.trim();
      const firstToken = label.match(/^[a-zA-Z]+/)?.[0] || '';
      const explicitDay = getDayIndex(firstToken);
      if (explicitDay !== null && explicitDay !== dayOfWeek) {
        return null;
      }
      return extractHours(fallbackLine);
    }
  }

  // Partial weekday_text (e.g. 1-day, 3-day) with no matching day
  return null;
}


