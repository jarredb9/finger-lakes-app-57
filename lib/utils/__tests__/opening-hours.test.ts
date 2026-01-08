import { isOpenNow } from '../opening-hours';

describe('isOpenNow', () => {
  // Helper to mock the current system time for consistent testing
  const mockTime = (day: number, hour: number, minute: number) => {
    jest.useFakeTimers();
    const date = new Date(2023, 0, 1 + day); // Jan 2023 started on Sunday (Day 0)
    date.setHours(hour, minute, 0, 0);
    jest.setSystemTime(date);
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  const standardHours = {
    periods: [
      { open: { day: 1, time: "0900" }, close: { day: 1, time: "1700" } }, // Mon 9-5
    ]
  };

  const midnightSpanHours = {
    periods: [
      { open: { day: 5, time: "2000" }, close: { day: 6, time: "0200" } }, // Fri 8pm - Sat 2am
    ]
  };

  const mixedFormatHours = {
    periods: [
      { open: { day: 2, hour: 10, minute: 0 }, close: { day: 2, hour: 18, minute: 0 } } // Tue 10-6 (Number format)
    ]
  };

  it('should return null if openingHours is null', () => {
    expect(isOpenNow(null)).toBeNull();
  });

  it('should return true when within standard hours', () => {
    mockTime(1, 12, 0); // Monday 12:00 PM
    // @ts-ignore - Testing loose JSON structure
    expect(isOpenNow(standardHours)).toBe(true);
  });

  it('should return false when outside standard hours', () => {
    mockTime(1, 18, 0); // Monday 6:00 PM
    // @ts-ignore
    expect(isOpenNow(standardHours)).toBe(false);
  });

  it('should return false on a different day', () => {
    mockTime(2, 12, 0); // Tuesday 12:00 PM
    // @ts-ignore
    expect(isOpenNow(standardHours)).toBe(false);
  });

  it('should handle midnight spanning periods (before midnight)', () => {
    mockTime(5, 23, 0); // Friday 11:00 PM
    // @ts-ignore
    expect(isOpenNow(midnightSpanHours)).toBe(true);
  });

  it('should handle midnight spanning periods (after midnight)', () => {
    mockTime(6, 1, 0); // Saturday 1:00 AM
    // @ts-ignore
    expect(isOpenNow(midnightSpanHours)).toBe(true);
  });

  it('should handle midnight spanning periods (after close)', () => {
    mockTime(6, 3, 0); // Saturday 3:00 AM
    // @ts-ignore
    expect(isOpenNow(midnightSpanHours)).toBe(false);
  });

  it('should handle number format { hour, minute } correctly', () => {
    mockTime(2, 14, 0); // Tuesday 2:00 PM
    // @ts-ignore
    expect(isOpenNow(mixedFormatHours)).toBe(true);
  });
});
