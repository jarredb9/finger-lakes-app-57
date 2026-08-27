import { render, screen, fireEvent } from '@testing-library/react';
import { MapLegendPopover, DEFAULT_LEGEND_ITEMS } from '../map-legend-popover';

describe('MapLegendPopover Component', () => {
  it('exports default symbology items matching application marker colors', () => {
    expect(DEFAULT_LEGEND_ITEMS).toEqual([
      expect.objectContaining({ label: 'Trip Stop', color: '#f17e3a' }),
      expect.objectContaining({ label: 'Favorite', color: '#FBBF24' }),
      expect.objectContaining({ label: 'Want to Go', color: '#9333ea' }),
      expect.objectContaining({ label: 'Visited', color: '#10B981' }),
      expect.objectContaining({ label: 'Discovered', color: '#3B82F6' }),
    ]);
  });

  it('renders trigger button with icon and label', () => {
    render(<MapLegendPopover />);

    const triggerBtn = screen.getByRole('button', { name: /legend/i });
    expect(triggerBtn).toBeInTheDocument();
  });

  it('opens popover on click and renders all symbology legend items', () => {
    render(<MapLegendPopover />);

    const triggerBtn = screen.getByRole('button', { name: /legend/i });
    fireEvent.click(triggerBtn);

    expect(screen.getByText('Map Legend')).toBeInTheDocument();
    expect(screen.getByText('Trip Stop')).toBeInTheDocument();
    expect(screen.getByText('Favorite')).toBeInTheDocument();
    expect(screen.getByText('Want to Go')).toBeInTheDocument();
    expect(screen.getByText('Visited')).toBeInTheDocument();
    expect(screen.getByText('Discovered')).toBeInTheDocument();
  });

  it('renders custom legend items when provided via props', () => {
    const customItems = [
      { label: 'Custom Stop', color: '#ff0000', borderColor: '#cc0000' },
    ];

    render(<MapLegendPopover items={customItems} />);

    const triggerBtn = screen.getByRole('button', { name: /legend/i });
    fireEvent.click(triggerBtn);

    expect(screen.getByText('Custom Stop')).toBeInTheDocument();
    expect(screen.queryByText('Trip Stop')).not.toBeInTheDocument();
  });
});
