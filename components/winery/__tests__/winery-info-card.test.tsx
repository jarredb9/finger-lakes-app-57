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
});
