import {
  isGooglePlaceId,
  isWineryDbId,
  toGooglePlaceId,
  toWineryDbId,
  GooglePlaceId,
  WineryDbId,
} from '../types';

function setNodeEnv(val: string | undefined) {
  (process.env as Record<string, string | undefined>).NODE_ENV = val;
}

describe('Branded ID Type Guards and Constructors', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    setNodeEnv(originalEnv);
    jest.restoreAllMocks();
  });

  describe('isGooglePlaceId', () => {
    it('returns true for non-empty trimmed strings', () => {
      expect(isGooglePlaceId('ChIJ123')).toBe(true);
      expect(isGooglePlaceId('ChIJN1t_tDeuEmsRUsoyG83frY4')).toBe(true);
      expect(isGooglePlaceId('place-id-abc')).toBe(true);
    });

    it('returns false for empty or whitespace-only strings', () => {
      expect(isGooglePlaceId('')).toBe(false);
      expect(isGooglePlaceId(' ')).toBe(false);
      expect(isGooglePlaceId('   \t\n')).toBe(false);
    });

    it('returns false for null, undefined, and non-string types', () => {
      expect(isGooglePlaceId(null)).toBe(false);
      expect(isGooglePlaceId(undefined)).toBe(false);
      expect(isGooglePlaceId(123)).toBe(false);
      expect(isGooglePlaceId(true)).toBe(false);
      expect(isGooglePlaceId({})).toBe(false);
      expect(isGooglePlaceId([])).toBe(false);
      expect(isGooglePlaceId(() => {})).toBe(false);
    });
  });

  describe('isWineryDbId', () => {
    it('returns true for positive integers', () => {
      expect(isWineryDbId(1)).toBe(true);
      expect(isWineryDbId(42)).toBe(true);
      expect(isWineryDbId(999999)).toBe(true);
    });

    it('returns false for zero and negative integers', () => {
      expect(isWineryDbId(0)).toBe(false);
      expect(isWineryDbId(-1)).toBe(false);
      expect(isWineryDbId(-100)).toBe(false);
    });

    it('returns false for non-integer numbers and special numeric values', () => {
      expect(isWineryDbId(1.5)).toBe(false);
      expect(isWineryDbId(0.1)).toBe(false);
      expect(isWineryDbId(NaN)).toBe(false);
      expect(isWineryDbId(Infinity)).toBe(false);
      expect(isWineryDbId(-Infinity)).toBe(false);
    });

    it('returns false for null, undefined, and non-number types', () => {
      expect(isWineryDbId(null)).toBe(false);
      expect(isWineryDbId(undefined)).toBe(false);
      expect(isWineryDbId('42')).toBe(false);
      expect(isWineryDbId('')).toBe(false);
      expect(isWineryDbId(true)).toBe(false);
      expect(isWineryDbId({})).toBe(false);
      expect(isWineryDbId([])).toBe(false);
    });
  });

  describe('toGooglePlaceId', () => {
    it('returns branded GooglePlaceId for valid strings without warnings', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const id: GooglePlaceId = toGooglePlaceId('ChIJ123');
      expect(id).toBe('ChIJ123');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('handles null and undefined overloads cleanly by returning undefined without warnings', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const nullResult: GooglePlaceId | undefined = toGooglePlaceId(null);
      const undefinedResult: GooglePlaceId | undefined = toGooglePlaceId(undefined);

      expect(nullResult).toBeUndefined();
      expect(undefinedResult).toBeUndefined();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('warns in development when given invalid, empty, or non-string inputs and returns fallback without throwing', () => {
      setNodeEnv('development');
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const emptyRes = toGooglePlaceId('');
      expect(warnSpy).toHaveBeenCalledWith(
        '[toGooglePlaceId] Warning: Invalid GooglePlaceId received:',
        ''
      );
      expect(emptyRes).toBe('');

      warnSpy.mockClear();
      const whitespaceRes = toGooglePlaceId('   ');
      expect(warnSpy).toHaveBeenCalledWith(
        '[toGooglePlaceId] Warning: Invalid GooglePlaceId received:',
        '   '
      );
      expect(whitespaceRes).toBe('   ');

      warnSpy.mockClear();
      const nonStringRes = toGooglePlaceId(123 as unknown as string);
      expect(warnSpy).toHaveBeenCalledWith(
        '[toGooglePlaceId] Warning: Invalid GooglePlaceId received:',
        123
      );
      expect(nonStringRes).toBe(123);
    });

    it('suppresses warnings in production mode for invalid inputs', () => {
      setNodeEnv('production');
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const res = toGooglePlaceId('');
      expect(res).toBe('');
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('toWineryDbId', () => {
    it('returns branded WineryDbId for valid positive integers without warnings', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const id: WineryDbId = toWineryDbId(42);
      expect(id).toBe(42);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('handles null and undefined overloads cleanly by returning undefined without warnings', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const nullResult: WineryDbId | undefined = toWineryDbId(null);
      const undefinedResult: WineryDbId | undefined = toWineryDbId(undefined);

      expect(nullResult).toBeUndefined();
      expect(undefinedResult).toBeUndefined();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('warns in development when given 0, negative numbers, floats, or non-numbers and returns fallback without throwing', () => {
      setNodeEnv('development');
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const zeroRes = toWineryDbId(0);
      expect(warnSpy).toHaveBeenCalledWith(
        '[toWineryDbId] Warning: Invalid WineryDbId received:',
        0
      );
      expect(zeroRes).toBe(0);

      warnSpy.mockClear();
      const negRes = toWineryDbId(-5);
      expect(warnSpy).toHaveBeenCalledWith(
        '[toWineryDbId] Warning: Invalid WineryDbId received:',
        -5
      );
      expect(negRes).toBe(-5);

      warnSpy.mockClear();
      const floatRes = toWineryDbId(1.5);
      expect(warnSpy).toHaveBeenCalledWith(
        '[toWineryDbId] Warning: Invalid WineryDbId received:',
        1.5
      );
      expect(floatRes).toBe(1.5);

      warnSpy.mockClear();
      const nanRes = toWineryDbId(NaN);
      expect(warnSpy).toHaveBeenCalledWith(
        '[toWineryDbId] Warning: Invalid WineryDbId received:',
        NaN
      );
      expect(Number.isNaN(nanRes)).toBe(true);

      warnSpy.mockClear();
      const nonNumRes = toWineryDbId('42' as unknown as number);
      expect(warnSpy).toHaveBeenCalledWith(
        '[toWineryDbId] Warning: Invalid WineryDbId received:',
        '42'
      );
      expect(nonNumRes).toBe('42');
    });

    it('suppresses warnings in production mode for invalid inputs', () => {
      setNodeEnv('production');
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const res = toWineryDbId(0);
      expect(res).toBe(0);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
