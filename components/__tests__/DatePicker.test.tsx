import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DatePicker } from '../DatePicker';
import { useIsMobile } from '@/hooks/use-mobile';

// Mock useIsMobile
jest.mock('@/hooks/use-mobile', () => ({
  useIsMobile: jest.fn()
}));

describe('DatePicker', () => {
  const onSelect = jest.fn();
  const mockDate = new Date('2026-05-15');

  beforeEach(() => {
    jest.clearAllMocks();
    (useIsMobile as jest.Mock).mockReturnValue(false);
  });

  it('renders correctly with no date', () => {
    render(<DatePicker date={undefined} onSelect={onSelect} />);
    expect(screen.getByText('Pick a date')).toBeInTheDocument();
  });

  it('renders correctly with a date', () => {
    render(<DatePicker date={mockDate} onSelect={onSelect} />);
    expect(screen.getByText(mockDate.toLocaleDateString())).toBeInTheDocument();
  });

  it('opens popover on click (desktop)', async () => {
    render(<DatePicker date={undefined} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('datepicker-trigger'));
    
    expect(screen.getByTestId('datepicker-calendar')).toBeInTheDocument();
    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  it('calls onSelect and closes when a date is selected (desktop)', async () => {
    render(<DatePicker date={undefined} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('datepicker-trigger'));
    
    // DayPicker v9 renders days as buttons with full date strings as accessible names
    const day15 = screen.getByRole('button', { name: /15/ });
    fireEvent.click(day15);
    
    expect(onSelect).toHaveBeenCalled();
    
    // Wait for popover to close
    await waitFor(() => {
      expect(screen.queryByTestId('datepicker-calendar')).not.toBeInTheDocument();
    });
  });

  it('renders correctly with a date (mobile)', () => {
    (useIsMobile as jest.Mock).mockReturnValue(true);
    render(<DatePicker date={mockDate} onSelect={onSelect} />);
    expect(screen.getByText(mockDate.toLocaleDateString())).toBeInTheDocument();
  });

  it('renders drawer on mobile', async () => {
    (useIsMobile as jest.Mock).mockReturnValue(true);
    render(<DatePicker date={undefined} onSelect={onSelect} />);
    
    fireEvent.click(screen.getByTestId('datepicker-trigger'));
    
    expect(screen.getByText('Select a date')).toBeInTheDocument();
    expect(screen.getByTestId('datepicker-calendar')).toBeInTheDocument();
  });

  it('calls onSelect and closes when a date is selected (mobile)', async () => {
    (useIsMobile as jest.Mock).mockReturnValue(true);
    render(<DatePicker date={undefined} onSelect={onSelect} />);
    
    fireEvent.click(screen.getByTestId('datepicker-trigger'));
    
    const day15 = screen.getByRole('button', { name: /15/ });
    fireEvent.click(day15);
    
    expect(onSelect).toHaveBeenCalled();
    
    await waitFor(() => {
      expect(screen.queryByText('Select a date')).not.toBeInTheDocument();
    });
  });
});
