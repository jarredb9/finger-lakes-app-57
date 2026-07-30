import { render, screen, waitFor } from '@testing-library/react';
import { fetchWineryWeather } from '../../lib/services/weatherService';
import { WineryWeatherWidget } from '../WineryWeatherWidget';

jest.mock('../../lib/services/weatherService');

describe('weatherService & WineryWeatherWidget Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders temperature and weather condition label when weather data is fetched', async () => {
    (fetchWineryWeather as jest.Mock).mockResolvedValue({
      temperature: 74,
      condition: 'Sunny Lake Breeze',
      windSpeed: 8,
      icon: '☀️',
    });

    render(<WineryWeatherWidget latitude={42.44} longitude={-76.87} />);

    await waitFor(() => {
      expect(screen.getByText(/74°F/)).toBeInTheDocument();
      expect(screen.getByText(/Sunny Lake Breeze/)).toBeInTheDocument();
    });
  });

  it('renders nothing when fetchWineryWeather returns null', async () => {
    (fetchWineryWeather as jest.Mock).mockResolvedValue(null);

    const { container } = render(<WineryWeatherWidget latitude={0} longitude={0} />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
