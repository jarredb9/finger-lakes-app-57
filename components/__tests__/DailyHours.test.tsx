import { render, screen } from '@testing-library/react';
import DailyHours from '../DailyHours';

describe('DailyHours component', () => {
  const wednesday = new Date(2026, 8, 30, 12, 0); // Wednesday
  const monday = new Date(2026, 8, 28, 12, 0); // Monday

  it('renders hours when openingHours has matching day', () => {
    const openingHours = {
      weekday_text: [
        'Monday: 10:00 AM – 5:00 PM',
        'Wednesday: 11:00 AM – 6:00 PM'
      ]
    };

    render(<DailyHours openingHours={openingHours} tripDate={wednesday} />);
    expect(screen.getByText('11:00 AM – 6:00 PM')).toBeInTheDocument();
  });

  it('renders nothing safely when day is not present in partial openingHours', () => {
    const openingHours = {
      weekday_text: ['Monday: 10:00 AM – 5:00 PM']
    };

    const { container } = render(<DailyHours openingHours={openingHours} tripDate={wednesday} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when openingHours is null or undefined', () => {
    const { container: c1 } = render(<DailyHours openingHours={null} tripDate={wednesday} />);
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(<DailyHours openingHours={undefined} tripDate={wednesday} />);
    expect(c2.firstChild).toBeNull();
  });

  it('renders nothing when hours are "Closed"', () => {
    const openingHours = {
      weekday_text: ['Monday: Closed']
    };

    const { container } = render(<DailyHours openingHours={openingHours} tripDate={monday} />);
    expect(container.firstChild).toBeNull();
  });
});
