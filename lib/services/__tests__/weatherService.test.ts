import { fetchWineryWeather, clearWeatherCache } from '../weatherService';

describe('weatherService Unit Tests', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearWeatherCache();
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns null for invalid, NaN, infinite, or out-of-range coordinates', async () => {
    expect(await fetchWineryWeather(NaN, -76.9)).toBeNull();
    expect(await fetchWineryWeather(42.8, NaN)).toBeNull();
    expect(await fetchWineryWeather(Infinity, -76.9)).toBeNull();
    expect(await fetchWineryWeather(42.8, -Infinity)).toBeNull();
    expect(await fetchWineryWeather('42.8' as any, -76.9)).toBeNull();
    expect(await fetchWineryWeather(95, -76.9)).toBeNull();
    expect(await fetchWineryWeather(42.8, 190)).toBeNull();
  });

  it('fetches weather data successfully and formats result', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          current: {
            temperature_2m: 72.4,
            relative_humidity_2m: 60,
            weather_code: 1,
            wind_speed_10m: 7.8,
          },
        }),
    } as any);

    const weather = await fetchWineryWeather(42.85, -76.95);
    expect(weather).toEqual({
      temperature: 72,
      condition: 'Partly Cloudy Lake Breeze',
      windSpeed: 8,
      icon: '⛅',
    });

    // Verify cache hit on second call
    const cachedWeather = await fetchWineryWeather(42.85, -76.95);
    expect(cachedWeather).toEqual(weather);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('gracefully handles non-JSON plain text responses (e.g. Unexpected error)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => 'Unexpected error occurred from proxy/firewall',
    } as any);

    const weather = await fetchWineryWeather(42.85, -76.95);
    expect(weather).toBeNull();
  });

  it('gracefully handles HTTP error responses (res.ok = false)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
    } as any);

    const weather = await fetchWineryWeather(42.85, -76.95);
    expect(weather).toBeNull();
  });

  it('gracefully handles missing current weather in JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ error: true, reason: 'Invalid parameters' }),
    } as any);

    const weather = await fetchWineryWeather(42.85, -76.95);
    expect(weather).toBeNull();
  });

  it('gracefully handles network rejection', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network offline'));

    const weather = await fetchWineryWeather(42.85, -76.95);
    expect(weather).toBeNull();
  });
});
