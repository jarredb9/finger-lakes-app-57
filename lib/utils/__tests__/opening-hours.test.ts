import { isOpenNow, parseTime } from '../opening-hours';

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
    expect(isOpenNow(standardHours)).toBe(true);
  });

  it('should return false when outside standard hours', () => {
    mockTime(1, 18, 0); // Monday 6:00 PM
    expect(isOpenNow(standardHours)).toBe(false);
  });

  it('should return false on a different day', () => {
    mockTime(2, 12, 0); // Tuesday 12:00 PM
    expect(isOpenNow(standardHours)).toBe(false);
  });

  it('should handle midnight spanning periods (before midnight)', () => {
    mockTime(5, 23, 0); // Friday 11:00 PM
    expect(isOpenNow(midnightSpanHours)).toBe(true);
  });

  it('should handle midnight spanning periods (after midnight)', () => {
    mockTime(6, 1, 0); // Saturday 1:00 AM
    expect(isOpenNow(midnightSpanHours)).toBe(true);
  });

  it('should handle midnight spanning periods (after close)', () => {
    mockTime(6, 3, 0); // Saturday 3:00 AM
    expect(isOpenNow(midnightSpanHours)).toBe(false);
  });

  it('should handle number format { hour, minute } correctly', () => {
    mockTime(2, 14, 0); // Tuesday 2:00 PM
    expect(isOpenNow(mixedFormatHours)).toBe(true);
  });
});

describe('parseTime invariant protection (Red Phase)', () => {
  it('returns NaN safely without throwing TypeError on null and undefined inputs', () => {
    expect(() => parseTime(null)).not.toThrow();
    expect(parseTime(null)).toBeNaN();

    expect(() => parseTime(undefined)).not.toThrow();
    expect(parseTime(undefined)).toBeNaN();
  });

  it('returns NaN safely without throwing TypeError on primitives or malformed objects', () => {
    expect(() => parseTime(123 as any)).not.toThrow();
    expect(parseTime(123 as any)).toBeNaN();

    expect(() => parseTime('1430' as any)).not.toThrow();
    expect(parseTime('1430' as any)).toBeNaN();

    expect(() => parseTime({} as any)).not.toThrow();
    expect(parseTime({} as any)).toBeNaN();

    expect(() => parseTime({ time: 'invalid' } as any)).not.toThrow();
    expect(parseTime({ time: 'invalid' } as any)).toBeNaN();

    expect(() => parseTime({ hour: undefined, minute: undefined } as any)).not.toThrow();
    expect(parseTime({ hour: undefined, minute: undefined } as any)).toBeNaN();
  });
});

describe('isOpenNow invariant protection & safe property navigation (Red Phase)', () => {
  it('returns null safely on empty periods array or missing periods without throwing TypeError', () => {
    expect(() => isOpenNow({ periods: [] } as any)).not.toThrow();
    expect(isOpenNow({ periods: [] } as any)).toBeNull();

    expect(() => isOpenNow({} as any)).not.toThrow();
    expect(isOpenNow({} as any)).toBeNull();

    expect(() => isOpenNow(undefined)).not.toThrow();
    expect(isOpenNow(undefined)).toBeNull();
  });

  it('handles malformed period objects with missing open without throwing TypeError', () => {
    const missingOpenSingle = {
      periods: [{ close: { day: 1, time: '1700' } }]
    };
    expect(() => isOpenNow(missingOpenSingle as any)).not.toThrow();
    expect(isOpenNow(missingOpenSingle as any)).toBe(false);

    const missingOpenMultiple = {
      periods: [
        { open: { day: 1, time: '0900' }, close: { day: 1, time: '1200' } },
        { close: { day: 1, time: '1700' } }
      ]
    };
    expect(() => isOpenNow(missingOpenMultiple as any)).not.toThrow();
    expect(isOpenNow(missingOpenMultiple as any)).toBe(false);
  });

  it('handles periods containing null or undefined items without throwing TypeError', () => {
    const nullPeriod = {
      periods: [null as any]
    };
    expect(() => isOpenNow(nullPeriod as any)).not.toThrow();
    expect(isOpenNow(nullPeriod as any)).toBe(false);

    const undefinedPeriod = {
      periods: [undefined as any]
    };
    expect(() => isOpenNow(undefinedPeriod as any)).not.toThrow();
    expect(isOpenNow(undefinedPeriod as any)).toBe(false);

    const mixedNullPeriod = {
      periods: [
        null as any,
        { open: { day: 1, time: '0900' }, close: { day: 1, time: '1700' } }
      ]
    };
    expect(() => isOpenNow(mixedNullPeriod as any)).not.toThrow();
  });

  it('handles malformed empty period objects without throwing TypeError', () => {
    const emptyPeriod = {
      periods: [{} as any]
    };
    expect(() => isOpenNow(emptyPeriod as any)).not.toThrow();
    expect(isOpenNow(emptyPeriod as any)).toBe(false);
  });

  it('handles periods with explicit undefined open/close properties without throwing TypeError', () => {
    const undefinedProperties = {
      periods: [{ open: undefined, close: undefined } as any]
    };
    expect(() => isOpenNow(undefinedProperties as any)).not.toThrow();
    expect(isOpenNow(undefinedProperties as any)).toBe(false);
  });

  it('handles periods where open has null or missing fields without throwing TypeError', () => {
    const nullOpen = {
      periods: [{ open: null as any, close: { day: 1, time: '1700' } }]
    };
    expect(() => isOpenNow(nullOpen as any)).not.toThrow();
    expect(isOpenNow(nullOpen as any)).toBe(false);

    const emptyOpen = {
      periods: [{ open: {} as any, close: { day: 1, time: '1700' } }]
    };
    expect(() => isOpenNow(emptyOpen as any)).not.toThrow();
    expect(isOpenNow(emptyOpen as any)).toBe(false);
  });

  it('handles non-array periods safely without throwing TypeError', () => {
    expect(() => isOpenNow({ periods: 'open-everyday' as any } as any)).not.toThrow();
    expect(isOpenNow({ periods: 'open-everyday' as any } as any)).toBeNull();

    expect(() => isOpenNow({ periods: 12345 as any } as any)).not.toThrow();
    expect(isOpenNow({ periods: 12345 as any } as any)).toBeNull();
  });

  it('handles periods with missing close (24/7 and non-24/7) safely', () => {
    // Single period open 24/7 (day 0, time 0000, no close)
    const open247 = {
      periods: [{ open: { day: 0, time: '0000' } }]
    };
    expect(() => isOpenNow(open247 as any)).not.toThrow();
    expect(isOpenNow(open247 as any)).toBe(true);

    // Single period, day 1, no close (not 24/7)
    const openNoClose = {
      periods: [{ open: { day: 1, time: '0900' } }]
    };
    expect(() => isOpenNow(openNoClose as any)).not.toThrow();
    expect(isOpenNow(openNoClose as any)).toBe(false);
  });
});
