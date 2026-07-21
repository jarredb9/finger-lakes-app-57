export interface WineryWeatherData {
  temperature: number; // in Fahrenheit
  condition: string;
  windSpeed: number; // in mph
  icon: string;
}

const cache = new Map<string, { data: WineryWeatherData; timestamp: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Maps WMO Weather Interpretation Codes to human readable conditions & icons.
 */
function mapWmoCodeToCondition(code: number): { condition: string; icon: string } {
  if (code === 0) return { condition: 'Clear Skies', icon: '☀️' };
  if (code >= 1 && code <= 3) return { condition: 'Partly Cloudy Lake Breeze', icon: '⛅' };
  if (code >= 45 && code <= 48) return { condition: 'Foggy Lake Mist', icon: '🌫️' };
  if (code >= 51 && code <= 67) return { condition: 'Light Rain & Drizzle', icon: '🌧️' };
  if (code >= 71 && code <= 77) return { condition: 'Snow Showers', icon: '❄️' };
  if (code >= 80 && code <= 82) return { condition: 'Rain Showers', icon: '🌦️' };
  if (code >= 95) return { condition: 'Thunderstorm', icon: '🌩️' };
  return { condition: 'Lake Breeze', icon: '🌤️' };
}

/**
 * Fetches outdoor weather & tasting conditions from Open-Meteo API for a given winery location.
 * Implements 15-minute in-memory caching to minimize external API calls.
 */
export async function fetchWineryWeather(latitude: number, longitude: number): Promise<WineryWeatherData | null> {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }

  const cacheKey = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
  const now = Date.now();

  const cached = cache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph`;

    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }

    const json = await res.json();
    const current = json?.current;
    if (!current) {
      return null;
    }

    const { condition, icon } = mapWmoCodeToCondition(current.weather_code ?? 0);

    const weatherData: WineryWeatherData = {
      temperature: Math.round(current.temperature_2m ?? 70),
      condition,
      windSpeed: Math.round(current.wind_speed_10m ?? 5),
      icon,
    };

    cache.set(cacheKey, { data: weatherData, timestamp: now });
    return weatherData;
  } catch (error) {
    console.error('Failed to fetch weather data from Open-Meteo:', error);
    return null;
  }
}
