import { isOpenNow, parseTime, getDailyHoursForDate, isDayForDate, extractHours } from '../opening-hours';

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

describe('isOpenNow', () => {

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
    mockTime(1, 10, 0); // Monday 10:00 (within valid period)
    expect(isOpenNow(missingOpenMultiple as any)).toBe(true);
    mockTime(1, 18, 0); // Monday 18:00 (outside valid period)
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
    mockTime(1, 12, 0); // Monday 12:00 (within valid period)
    expect(isOpenNow(mixedNullPeriod as any)).toBe(true);
    mockTime(1, 18, 0); // Monday 18:00 (outside valid period)
    expect(isOpenNow(mixedNullPeriod as any)).toBe(false);
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

describe('getDailyHoursForDate', () => {
  // Test reference dates for each day of the week in Sept 2026:
  // 2026-09-27 = Sunday (day 0)
  // 2026-09-28 = Monday (day 1)
  // 2026-09-29 = Tuesday (day 2)
  // 2026-09-30 = Wednesday (day 3)
  // 2026-10-01 = Thursday (day 4)
  // 2026-10-02 = Friday (day 5)
  // 2026-10-03 = Saturday (day 6)
  const sunday = new Date(2026, 8, 27, 12, 0);
  const monday = new Date(2026, 8, 28, 12, 0);
  const tuesday = new Date(2026, 8, 29, 12, 0);
  const wednesday = new Date(2026, 8, 30, 12, 0);
  const thursday = new Date(2026, 9, 1, 12, 0);
  const friday = new Date(2026, 9, 2, 12, 0);
  const saturday = new Date(2026, 9, 3, 12, 0);

  describe('null and invalid inputs', () => {
    it('returns null on null or undefined openingHours', () => {
      expect(getDailyHoursForDate(null)).toBeNull();
      expect(getDailyHoursForDate(undefined)).toBeNull();
      expect(getDailyHoursForDate({} as any)).toBeNull();
    });

    it('returns null on missing or empty weekday_text array', () => {
      expect(getDailyHoursForDate({ weekday_text: [] } as any)).toBeNull();
      expect(getDailyHoursForDate({ weekday_text: null as any } as any)).toBeNull();
      expect(getDailyHoursForDate({ weekday_text: 'not-an-array' as any } as any)).toBeNull();
    });

    it('returns null on invalid targetDate', () => {
      const hours = { weekday_text: ['Monday: 10:00 AM – 5:00 PM'] };
      expect(getDailyHoursForDate(hours, new Date('invalid'))).toBeNull();
      expect(getDailyHoursForDate(hours, null as any)).toBeNull();
    });

    it('uses current date as default when targetDate is omitted', () => {
      mockTime(1, 12, 0); // Monday
      const hours = {
        weekday_text: [
          'Monday: 10:00 AM – 5:00 PM',
          'Tuesday: 10:00 AM – 5:00 PM'
        ]
      };
      expect(getDailyHoursForDate(hours)).toBe('10:00 AM – 5:00 PM');
    });
  });

  describe('1-day opening hours', () => {
    const singleDayHours = {
      weekday_text: ['Monday: 10:00 AM – 5:00 PM']
    };

    it('returns hours when targetDate matches the single day', () => {
      expect(getDailyHoursForDate(singleDayHours, monday)).toBe('10:00 AM – 5:00 PM');
    });

    it('returns null safely without throwing when targetDate is another day of the week', () => {
      expect(getDailyHoursForDate(singleDayHours, wednesday)).toBeNull();
      expect(getDailyHoursForDate(singleDayHours, tuesday)).toBeNull();
      expect(getDailyHoursForDate(singleDayHours, sunday)).toBeNull();
      expect(getDailyHoursForDate(singleDayHours, friday)).toBeNull();
    });
  });

  describe('3-day opening hours', () => {
    const weekendHours = {
      weekday_text: [
        'Friday: 12:00 PM – 6:00 PM',
        'Saturday: 10:00 AM – 6:00 PM',
        'Sunday: 11:00 AM – 5:00 PM'
      ]
    };

    it('returns correct hours for included days', () => {
      expect(getDailyHoursForDate(weekendHours, friday)).toBe('12:00 PM – 6:00 PM');
      expect(getDailyHoursForDate(weekendHours, saturday)).toBe('10:00 AM – 6:00 PM');
      expect(getDailyHoursForDate(weekendHours, sunday)).toBe('11:00 AM – 5:00 PM');
    });

    it('returns null for days not present in the 3-day schedule', () => {
      expect(getDailyHoursForDate(weekendHours, monday)).toBeNull();
      expect(getDailyHoursForDate(weekendHours, tuesday)).toBeNull();
      expect(getDailyHoursForDate(weekendHours, wednesday)).toBeNull();
      expect(getDailyHoursForDate(weekendHours, thursday)).toBeNull();
    });
  });

  describe('7-day opening hours (full names)', () => {
    const fullWeek = {
      weekday_text: [
        'Monday: 10:00 AM – 5:00 PM',
        'Tuesday: 10:00 AM – 5:00 PM',
        'Wednesday: 10:00 AM – 5:00 PM',
        'Thursday: 10:00 AM – 5:00 PM',
        'Friday: 10:00 AM – 7:00 PM',
        'Saturday: 10:00 AM – 7:00 PM',
        'Sunday: 11:00 AM – 4:00 PM'
      ]
    };

    it('returns hours for every day of the week', () => {
      expect(getDailyHoursForDate(fullWeek, monday)).toBe('10:00 AM – 5:00 PM');
      expect(getDailyHoursForDate(fullWeek, tuesday)).toBe('10:00 AM – 5:00 PM');
      expect(getDailyHoursForDate(fullWeek, wednesday)).toBe('10:00 AM – 5:00 PM');
      expect(getDailyHoursForDate(fullWeek, thursday)).toBe('10:00 AM – 5:00 PM');
      expect(getDailyHoursForDate(fullWeek, friday)).toBe('10:00 AM – 7:00 PM');
      expect(getDailyHoursForDate(fullWeek, saturday)).toBe('10:00 AM – 7:00 PM');
      expect(getDailyHoursForDate(fullWeek, sunday)).toBe('11:00 AM – 4:00 PM');
    });

    it('matches by day name even if elements are ordered non-standardly (e.g. Sunday first)', () => {
      const sundayFirst = {
        weekday_text: [
          'Sunday: 11:00 AM – 4:00 PM',
          'Monday: 10:00 AM – 5:00 PM',
          'Tuesday: 10:00 AM – 5:00 PM',
          'Wednesday: 10:00 AM – 5:00 PM',
          'Thursday: 10:00 AM – 5:00 PM',
          'Friday: 10:00 AM – 7:00 PM',
          'Saturday: 10:00 AM – 7:00 PM'
        ]
      };
      expect(getDailyHoursForDate(sundayFirst, monday)).toBe('10:00 AM – 5:00 PM');
      expect(getDailyHoursForDate(sundayFirst, sunday)).toBe('11:00 AM – 4:00 PM');
      expect(getDailyHoursForDate(sundayFirst, friday)).toBe('10:00 AM – 7:00 PM');
    });
  });

  describe('abbreviated day names', () => {
    it('supports 3-letter abbreviations (Mon, Tue, Wed, Thu, Fri, Sat, Sun)', () => {
      const abbreviatedHours = {
        weekday_text: [
          'Mon: 10:00 AM – 5:00 PM',
          'Tue: 10:00 AM – 5:00 PM',
          'Wed: 10:00 AM – 5:00 PM',
          'Thu: 10:00 AM – 5:00 PM',
          'Fri: 10:00 AM – 6:00 PM',
          'Sat: 10:00 AM – 6:00 PM',
          'Sun: 11:00 AM – 5:00 PM'
        ]
      };
      expect(getDailyHoursForDate(abbreviatedHours, monday)).toBe('10:00 AM – 5:00 PM');
      expect(getDailyHoursForDate(abbreviatedHours, wednesday)).toBe('10:00 AM – 5:00 PM');
      expect(getDailyHoursForDate(abbreviatedHours, friday)).toBe('10:00 AM – 6:00 PM');
      expect(getDailyHoursForDate(abbreviatedHours, sunday)).toBe('11:00 AM – 5:00 PM');
    });

    it('supports 4-letter abbreviations (Tues, Thurs)', () => {
      const fourLetterHours = {
        weekday_text: [
          'Tues: 11:00 AM – 5:00 PM',
          'Thurs: 11:00 AM – 7:00 PM'
        ]
      };
      expect(getDailyHoursForDate(fourLetterHours, tuesday)).toBe('11:00 AM – 5:00 PM');
      expect(getDailyHoursForDate(fourLetterHours, thursday)).toBe('11:00 AM – 7:00 PM');
      expect(getDailyHoursForDate(fourLetterHours, monday)).toBeNull();
    });
  });

  describe('positional fallback for 7-day arrays without day names', () => {
    it('falls back positionally to Monday-based index when exactly 7 entries exist and day names are absent', () => {
      const nameless7Days = {
        weekday_text: [
          '10:00 AM – 5:00 PM', // Monday (index 0)
          '10:00 AM – 5:00 PM', // Tuesday (index 1)
          '10:00 AM – 6:00 PM', // Wednesday (index 2)
          '10:00 AM – 6:00 PM', // Thursday (index 3)
          '10:00 AM – 8:00 PM', // Friday (index 4)
          '10:00 AM – 8:00 PM', // Saturday (index 5)
          '11:00 AM – 4:00 PM'  // Sunday (index 6)
        ]
      };
      expect(getDailyHoursForDate(nameless7Days, monday)).toBe('10:00 AM – 5:00 PM');
      expect(getDailyHoursForDate(nameless7Days, wednesday)).toBe('10:00 AM – 6:00 PM');
      expect(getDailyHoursForDate(nameless7Days, friday)).toBe('10:00 AM – 8:00 PM');
      expect(getDailyHoursForDate(nameless7Days, sunday)).toBe('11:00 AM – 4:00 PM');
    });

    it('does NOT use positional fallback when length !== 7', () => {
      const namelessPartial = {
        weekday_text: ['10:00 AM – 5:00 PM']
      };
      expect(getDailyHoursForDate(namelessPartial, monday)).toBeNull();
    });
  });

  describe('safe formatting and extraction edge cases', () => {
    it('handles lines without space after colon', () => {
      const hours = { weekday_text: ['Monday:10:00 AM – 5:00 PM'] };
      expect(getDailyHoursForDate(hours, monday)).toBe('10:00 AM – 5:00 PM');
    });

    it('handles lines with extra whitespace', () => {
      const hours = { weekday_text: ['  Monday:   10:00 AM – 5:00 PM   '] };
      expect(getDailyHoursForDate(hours, monday)).toBe('10:00 AM – 5:00 PM');
    });

    it('handles "Closed" status', () => {
      const hours = { weekday_text: ['Wednesday: Closed'] };
      expect(getDailyHoursForDate(hours, wednesday)).toBe('Closed');
    });

    it('handles "Open 24 hours" status', () => {
      const hours = { weekday_text: ['Friday: Open 24 hours'] };
      expect(getDailyHoursForDate(hours, friday)).toBe('Open 24 hours');
    });

    it('returns null when hours string after colon is empty', () => {
      const hours = { weekday_text: ['Monday:   '] };
      expect(getDailyHoursForDate(hours, monday)).toBeNull();
    });

    it('handles non-string entries in weekday_text without throwing', () => {
      const malformedHours = {
        weekday_text: [null as any, undefined as any, 123 as any, 'Monday: 10:00 AM – 5:00 PM']
      };
      expect(() => getDailyHoursForDate(malformedHours, monday)).not.toThrow();
      expect(getDailyHoursForDate(malformedHours, monday)).toBe('10:00 AM – 5:00 PM');
      expect(getDailyHoursForDate(malformedHours, wednesday)).toBeNull();
    });
  });
});

describe('isDayForDate', () => {
  const monday = new Date(2026, 8, 28, 12, 0); // Monday
  const tuesday = new Date(2026, 8, 29, 12, 0); // Tuesday
  const wednesday = new Date(2026, 8, 30, 12, 0); // Wednesday
  const thursday = new Date(2026, 9, 1, 12, 0); // Thursday

  it('correctly matches full day names', () => {
    expect(isDayForDate('Monday', monday)).toBe(true);
    expect(isDayForDate('Tuesday', monday)).toBe(false);
    expect(isDayForDate('Wednesday', wednesday)).toBe(true);
  });

  it('correctly matches day lines with colons', () => {
    expect(isDayForDate('Monday: 10:00 AM – 5:00 PM', monday)).toBe(true);
    expect(isDayForDate('Monday: 10:00 AM – 5:00 PM', tuesday)).toBe(false);
  });

  it('correctly distinguishes Tuesday and Thursday abbreviations', () => {
    expect(isDayForDate('Tue', tuesday)).toBe(true);
    expect(isDayForDate('Tues', tuesday)).toBe(true);
    expect(isDayForDate('Tue', thursday)).toBe(false);

    expect(isDayForDate('Thu', thursday)).toBe(true);
    expect(isDayForDate('Thurs', thursday)).toBe(true);
    expect(isDayForDate('Thu', tuesday)).toBe(false);
  });

  it('returns false safely on invalid inputs', () => {
    expect(isDayForDate('', monday)).toBe(false);
    expect(isDayForDate(null as any, monday)).toBe(false);
    expect(isDayForDate('Monday', null as any)).toBe(false);
    expect(isDayForDate('Monday', new Date('invalid'))).toBe(false);
  });
});

describe('extractHours', () => {
  it('extracts hours from standard Day: Hours format', () => {
    expect(extractHours('Monday: 10:00 AM – 5:00 PM')).toBe('10:00 AM – 5:00 PM');
  });

  it('extracts hours when no space after colon', () => {
    expect(extractHours('Monday:10:00 AM – 5:00 PM')).toBe('10:00 AM – 5:00 PM');
  });

  it('extracts plain hours string if no day prefix', () => {
    expect(extractHours('10:00 AM – 5:00 PM')).toBe('10:00 AM – 5:00 PM');
  });

  it('returns null if line is only a day name without hours', () => {
    expect(extractHours('Monday')).toBeNull();
    expect(extractHours('Wed.')).toBeNull();
  });

  it('returns null on empty or whitespace strings', () => {
    expect(extractHours('')).toBeNull();
    expect(extractHours('   ')).toBeNull();
    expect(extractHours(null as any)).toBeNull();
  });
});

describe('day ranges and non-day prefix protection', () => {
  const monday = new Date(2026, 8, 28, 12, 0); // Monday
  const wednesday = new Date(2026, 8, 30, 12, 0); // Wednesday
  const friday = new Date(2026, 9, 2, 12, 0); // Friday
  const sunday = new Date(2026, 9, 4, 12, 0); // Sunday

  it('matches day ranges like Mon-Fri correctly', () => {
    const hours = {
      weekday_text: ['Mon-Fri: 10:00 AM – 5:00 PM', 'Sat-Sun: 11:00 AM – 4:00 PM']
    };
    expect(getDailyHoursForDate(hours, monday)).toBe('10:00 AM – 5:00 PM');
    expect(getDailyHoursForDate(hours, wednesday)).toBe('10:00 AM – 5:00 PM');
    expect(getDailyHoursForDate(hours, friday)).toBe('10:00 AM – 5:00 PM');
    expect(getDailyHoursForDate(hours, sunday)).toBe('11:00 AM – 4:00 PM');
  });

  it('does NOT falsely match non-day phrases starting with day abbreviations', () => {
    expect(isDayForDate('Month of May: Closed', monday)).toBe(false);
    expect(isDayForDate('Sunrise Yoga: 7:00 AM', sunday)).toBe(false);
    expect(isDayForDate('Friends & Family: 12:00 PM', friday)).toBe(false);
  });

  it('rejects positional fallback when 7-day array line explicitly belongs to another day', () => {
    // 7 elements, but index 2 is explicitly labeled Friday
    const hours = {
      weekday_text: [
        'Monday: 10:00 AM – 5:00 PM',
        'Tuesday: 10:00 AM – 5:00 PM',
        'Friday: 10:00 AM – 5:00 PM', // Mislabeled index 2 (which would be Wednesday)
        'Thursday: 10:00 AM – 5:00 PM',
        'Friday: 10:00 AM – 5:00 PM',
        'Saturday: 10:00 AM – 5:00 PM',
        'Sunday: 10:00 AM – 5:00 PM'
      ]
    };
    // Wednesday is missing, and index 2 is explicitly Friday, so Wednesday should be null
    expect(getDailyHoursForDate(hours, wednesday)).toBeNull();
  });
});


