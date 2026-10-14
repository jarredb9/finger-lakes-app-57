import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as MapNavigationModule from '../MapNavigation';

const MapNavigation: React.ComponentType<any> =
  (MapNavigationModule as any).MapNavigation ||
  (MapNavigationModule as any).default;

describe('MapNavigation Component (Issue #63: Trip Navigation)', () => {
  const mockStops = [
    {
      id: 'stop-1',
      name: 'Boundary Breaks Vineyard',
      latitude: 42.6186,
      longitude: -76.8824,
    },
    {
      id: 'stop-2',
      name: 'Dr. Konstantin Frank Winery',
      latitude: 42.5028,
      longitude: -77.1601,
    },
    {
      id: 'stop-3',
      name: 'Weis Vineyards',
      latitude: 42.4411,
      longitude: -77.1264,
    },
  ];

  let mockGetCurrentPosition: jest.Mock;
  let openSpy: jest.SpyInstance;

  beforeEach(() => {
    mockGetCurrentPosition = jest.fn();
    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        getCurrentPosition: mockGetCurrentPosition,
        watchPosition: jest.fn(),
        clearWatch: jest.fn(),
      },
      writable: true,
      configurable: true,
    });
    openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    openSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('renders trigger button using Domain Model terminology "Trip Navigation"', () => {
    render(
      <MapNavigation
        stops={mockStops}
        trip={{ id: 'trip-1', title: 'Seneca Tour', stops: mockStops }}
      />
    );

    const triggerButton = screen.getByRole('button', {
      name: /trip navigation|navigate/i,
    });
    expect(triggerButton).toBeInTheDocument();
    expect(triggerButton).not.toBeDisabled();
    expect(screen.queryByText(/export route|maps export/i)).not.toBeInTheDocument();
  });

  it('opens provider selection modal when clicked, displaying Google Maps, Apple Maps, and Waze', () => {
    render(
      <MapNavigation
        stops={mockStops}
        trip={{ id: 'trip-1', title: 'Seneca Tour', stops: mockStops }}
      />
    );

    const triggerButton = screen.getByRole('button', {
      name: /trip navigation|navigate/i,
    });
    fireEvent.click(triggerButton);

    expect(screen.getByRole('button', { name: /google maps/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apple maps/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /waze/i })).toBeInTheDocument();
  });

  it('launches navigation immediately without calling navigator.geolocation.getCurrentPosition to preserve user gesture token', () => {
    render(
      <MapNavigation
        stops={mockStops}
        trip={{ id: 'trip-1', title: 'Seneca Tour', stops: mockStops }}
      />
    );

    const triggerButton = screen.getByRole('button', {
      name: /trip navigation|navigate/i,
    });
    fireEvent.click(triggerButton);

    const googleMapsButton = screen.getByRole('button', { name: /google maps/i });
    fireEvent.click(googleMapsButton);

    expect(mockGetCurrentPosition).not.toHaveBeenCalled();
  });

  it('resets button loading state and does not remain permanently disabled after launch', () => {
    render(
      <MapNavigation
        stops={mockStops}
        trip={{ id: 'trip-1', title: 'Seneca Tour', stops: mockStops }}
      />
    );

    const triggerButton = screen.getByRole('button', {
      name: /trip navigation|navigate/i,
    });
    fireEvent.click(triggerButton);

    const appleMapsButton = screen.getByRole('button', { name: /apple maps/i });
    fireEvent.click(appleMapsButton);

    expect(triggerButton).not.toBeDisabled();
  });

  it('resets button state when modal is cancelled or dismissed', () => {
    render(
      <MapNavigation
        stops={mockStops}
        trip={{ id: 'trip-1', title: 'Seneca Tour', stops: mockStops }}
      />
    );

    const triggerButton = screen.getByRole('button', {
      name: /trip navigation|navigate/i,
    });
    fireEvent.click(triggerButton);

    const cancelButton = screen.queryByRole('button', { name: /cancel|close/i });
    if (cancelButton) {
      fireEvent.click(cancelButton);
    } else {
      const dialog = screen.queryByRole('dialog');
      if (dialog) {
        fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
      }
    }

    expect(triggerButton).not.toBeDisabled();
  });

  it('functions gracefully even when geolocation is entirely blocked or unavailable', () => {
    Object.defineProperty(global.navigator, 'geolocation', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    render(
      <MapNavigation
        stops={mockStops}
        trip={{ id: 'trip-1', title: 'Seneca Tour', stops: mockStops }}
      />
    );

    const triggerButton = screen.getByRole('button', {
      name: /trip navigation|navigate/i,
    });
    fireEvent.click(triggerButton);

    const wazeButton = screen.getByRole('button', { name: /waze/i });
    expect(wazeButton).toBeInTheDocument();
    fireEvent.click(wazeButton);

    expect(triggerButton).not.toBeDisabled();
  });
});
