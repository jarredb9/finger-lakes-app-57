import { render, screen, fireEvent } from '@testing-library/react';
import { TripNavigation } from '@/components/TripNavigation';
import * as tripNavUtils from '@/lib/utils/trip-navigation';

jest.mock('@/lib/utils/trip-navigation', () => {
  const actual = jest.requireActual('@/lib/utils/trip-navigation');
  return {
    ...actual,
    launchTripNavigation: jest.fn(),
    getTripNavigationUrls: jest.fn(() => ({
      apple: 'https://maps.apple.com/?daddr=test',
      google: 'https://www.google.com/maps/dir/?api=1&destination=test',
      waze: 'https://waze.com/ul?ll=test',
    })),
  };
});

describe('TripNavigation Component', () => {
  const mockStops = [
    {
      id: '1',
      name: 'Stag\'s Leap Wine Cellars',
      latitude: 38.406,
      longitude: -122.315,
      address: '5766 Silverado Trail, Napa, CA',
    },
    {
      id: '2',
      name: 'Robert Mondavi Winery',
      latitude: 38.431,
      longitude: -122.404,
      address: '7801 St Helena Hwy, Oakville, CA',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the navigation trigger button', () => {
    render(<TripNavigation stops={mockStops} />);
    expect(screen.getByRole('button', { name: /trip navigation|navigate trip/i })).toBeInTheDocument();
  });

  it('should open navigation provider selection dialog upon clicking trigger', () => {
    render(<TripNavigation stops={mockStops} />);
    const trigger = screen.getByRole('button', { name: /trip navigation|navigate trip/i });
    fireEvent.click(trigger);

    expect(screen.getByText(/apple maps/i)).toBeInTheDocument();
    expect(screen.getByText(/google maps/i)).toBeInTheDocument();
    expect(screen.getByText(/waze/i)).toBeInTheDocument();
  });

  it('should invoke launchTripNavigation with "apple" when Apple Maps is selected', () => {
    render(<TripNavigation stops={mockStops} />);
    fireEvent.click(screen.getByRole('button', { name: /trip navigation|navigate trip/i }));

    const appleBtn = screen.getByRole('button', { name: /apple maps/i });
    fireEvent.click(appleBtn);

    expect(tripNavUtils.launchTripNavigation).toHaveBeenCalledWith(
      'apple',
      mockStops,
      expect.anything()
    );
  });

  it('should invoke launchTripNavigation with "google" when Google Maps is selected', () => {
    render(<TripNavigation stops={mockStops} />);
    fireEvent.click(screen.getByRole('button', { name: /trip navigation|navigate trip/i }));

    const googleBtn = screen.getByRole('button', { name: /google maps/i });
    fireEvent.click(googleBtn);

    expect(tripNavUtils.launchTripNavigation).toHaveBeenCalledWith(
      'google',
      mockStops,
      expect.anything()
    );
  });

  it('should not remain stuck in loading/disabled state after selection or dismissal', () => {
    render(<TripNavigation stops={mockStops} />);
    const trigger = screen.getByRole('button', { name: /trip navigation|navigate trip/i });
    fireEvent.click(trigger);

    const appleBtn = screen.getByRole('button', { name: /apple maps/i });
    fireEvent.click(appleBtn);

    // Trigger button should still be enabled and available for subsequent launches
    expect(trigger).not.toBeDisabled();
  });

  it('should be disabled when stops array is empty', () => {
    render(<TripNavigation stops={[]} />);
    const trigger = screen.getByRole('button', { name: /trip navigation|navigate trip/i });
    expect(trigger).toBeDisabled();
  });
});
