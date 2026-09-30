import { render, screen, fireEvent } from '@testing-library/react';
import { WineryInfoCard } from '../winery-info-card';
import { createMockWinery } from '@/lib/test-utils/fixtures';

describe('WineryInfoCard', () => {
  it('renders base info and contact action buttons correctly', () => {
    const winery = createMockWinery({
      name: 'Dr. Konstantin Frank',
      address: '9749 Middle Rd, Hammondsport, NY 14840',
      phone: '800-320-0735',
      website: 'https://drfrankwines.com',
      latitude: 42.4725,
      longitude: -77.1725,
    });

    render(<WineryInfoCard winery={winery} />);

    expect(screen.getByTestId('winery-address-info')).toHaveTextContent('9749 Middle Rd, Hammondsport, NY 14840');
    expect(screen.getByText('800-320-0735')).toBeInTheDocument();
    expect(screen.getByText('Visit Website')).toHaveAttribute('href', 'https://drfrankwines.com');
    expect(screen.getByTestId('route-from-current')).toBeInTheDocument();
  });

  it('renders disabled button states when phone or website is missing', () => {
    const winery = createMockWinery({
      phone: undefined,
      website: undefined,
    });

    render(<WineryInfoCard winery={winery} />);

    expect(screen.queryByText('Visit Website')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /tel:/i })).not.toBeInTheDocument();
  });

  it('toggles weekly hours dropdown on click and displays open status', () => {
    const winery = createMockWinery({
      openingHours: {
        open_now: true,
        periods: [
          {
            open: { day: 0, hour: 0, minute: 0 },
          },
        ],
        weekday_text: [
          'Monday: 10:00 AM – 5:00 PM',
          'Tuesday: 10:00 AM – 5:00 PM',
          'Wednesday: 10:00 AM – 5:00 PM',
          'Thursday: 10:00 AM – 5:00 PM',
          'Friday: 10:00 AM – 5:00 PM',
          'Saturday: 10:00 AM – 5:00 PM',
          'Sunday: 10:00 AM – 5:00 PM',
        ],
      },
    });

    render(<WineryInfoCard winery={winery} />);

    expect(screen.getByText('Open Now')).toBeInTheDocument();
    const toggleButton = screen.getByTestId('hours-toggle');
    expect(toggleButton).toBeInTheDocument();

    expect(screen.queryByText('Weekly Hours')).not.toBeInTheDocument();

    fireEvent.click(toggleButton);
    expect(screen.getByText('Weekly Hours')).toBeInTheDocument();
    expect(screen.getByText('Monday')).toBeInTheDocument();

    fireEvent.click(toggleButton);
    expect(screen.queryByText('Weekly Hours')).not.toBeInTheDocument();
  });

  it('renders safely without throwing TypeError when weekday_text has fewer than 7 entries on days other than Monday', () => {
    // Mock system time to Wednesday (day 3)
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 30, 12, 0)); // Wednesday

    const winery = createMockWinery({
      openingHours: {
        open_now: true,
        weekday_text: ['Monday: 10:00 AM – 5:00 PM'],
      },
    });

    render(<WineryInfoCard winery={winery} />);

    // Since today is Wednesday and only Monday is in weekday_text, it should display Hours Unavailable safely
    expect(screen.getByText('Hours Unavailable')).toBeInTheDocument();

    // Toggle hours dropdown should safely show Monday without crashing
    const toggleButton = screen.getByTestId('hours-toggle');
    fireEvent.click(toggleButton);
    expect(screen.getByText('Weekly Hours')).toBeInTheDocument();
    expect(screen.getByText('Monday')).toBeInTheDocument();
    expect(screen.getByText('10:00 AM – 5:00 PM')).toBeInTheDocument();

    jest.useRealTimers();
  });

  it('handles null or undefined openingHours gracefully', () => {
    const winery = createMockWinery({
      openingHours: undefined,
    });

    render(<WineryInfoCard winery={winery} />);
    expect(screen.queryByTestId('hours-toggle')).not.toBeInTheDocument();
  });

  describe('Tri-state operational status, loading skeleton, and schedule fallbacks (Phase 1)', () => {
    it('displays "Open Now" with green indicator when isOpenNow is true', () => {
      const winery = createMockWinery({
        openingHours: {
          open_now: true,
          periods: [{ open: { day: 0, hour: 0, minute: 0 } }],
          weekday_text: ['Open 24 hours'],
        },
      });
      render(<WineryInfoCard winery={winery} />);
      expect(screen.getByText('Open Now')).toBeInTheDocument();
    });

    it('displays "Closed" with red indicator when isOpenNow is false', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2026, 8, 30, 12, 0)); // Wednesday 12:00
      const winery = createMockWinery({
        openingHours: {
          open_now: false,
          periods: [{ open: { day: 2, hour: 10, minute: 0 }, close: { day: 2, hour: 17, minute: 0 } }], // Tuesday only
          weekday_text: ['Tuesday: 10:00 AM – 5:00 PM'],
        },
      });
      render(<WineryInfoCard winery={winery} />);
      expect(screen.getByText('Closed')).toBeInTheDocument();
      jest.useRealTimers();
    });

    it('displays "Hours Unavailable" with neutral indicator when openingHours are missing and isLoading is false', () => {
      const winery = createMockWinery({
        openingHours: null,
      });
      render(<WineryInfoCard winery={winery} {...({ isLoading: false } as any)} />);
      expect(screen.getByText('Hours Unavailable')).toBeInTheDocument();
      expect(screen.queryByText('Closed')).not.toBeInTheDocument();
    });

    it('renders animated loading skeleton pill in status badge when isLoading is true', () => {
      const winery = createMockWinery({
        openingHours: null,
      });
      render(<WineryInfoCard winery={winery} {...({ isLoading: true } as any)} />);
      expect(screen.getByTestId('status-loading-skeleton')).toBeInTheDocument();
      expect(screen.queryByText('Open Now')).not.toBeInTheDocument();
      expect(screen.queryByText('Closed')).not.toBeInTheDocument();
    });

    it('renders schedule subtext as "Hours Unavailable" with direct website fallback link when openingHours are missing and website is present', () => {
      const winery = createMockWinery({
        openingHours: null,
        website: 'https://drfrankwines.com',
      });
      render(<WineryInfoCard winery={winery} {...({ isLoading: false } as any)} />);
      expect(screen.getByTestId('schedule-fallback-website')).toHaveAttribute('href', 'https://drfrankwines.com');
    });
  });
});

