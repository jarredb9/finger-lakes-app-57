// @ts-nocheck
import { render, screen } from '@testing-library/react';
// @ts-ignore
import { WineryVarietalsTab } from '../WineryVarietalsTab';

describe('WineryVarietalsTab Unit Tests', () => {
  const mockVarietals = [
    {
      name: 'Dry Riesling',
      description: 'Crisp and mineral with white peach notes',
      sweetness: 2, // 1-10 (Dry)
      body: 4, // 1-10 (Light)
    },
    {
      name: 'Cabernet Franc',
      description: 'Bold red cherry with subtle bell pepper and oak',
      sweetness: 1,
      body: 8,
    },
  ];

  it('renders grape varietal cards with names, descriptions, and flavor profile sliders', () => {
    render(
      <WineryVarietalsTab
        varietals={mockVarietals}
      />
    );

    expect(screen.getByText('Dry Riesling')).toBeInTheDocument();
    expect(screen.getByText('Crisp and mineral with white peach notes')).toBeInTheDocument();
    expect(screen.getByText('Cabernet Franc')).toBeInTheDocument();

    // Verify flavor profile sliders
    expect(screen.getAllByRole('slider')).toHaveLength(4); // 2 sliders per card x 2 cards
  });

  it('detects common varietals from reviews when varietals prop is not provided', () => {
    const reviews = [
      { text: 'They have an incredible Ice Wine and Dry Riesling here.' }
    ];
    render(
      <WineryVarietalsTab
        reviews={reviews}
      />
    );

    expect(screen.getByText('Ice Wine')).toBeInTheDocument();
    expect(screen.getByText('Dry Riesling')).toBeInTheDocument();
  });

  it('displays empty state when no varietals or matching reviews exist without falling back to Finger Lakes Riesling', () => {
    render(
      <WineryVarietalsTab
        reviews={[]}
      />
    );

    expect(screen.getByTestId('empty-varietals-state')).toBeInTheDocument();
    expect(screen.getByText(/Varietal details not yet available/i)).toBeInTheDocument();
    expect(screen.queryByText('Riesling')).not.toBeInTheDocument();
    expect(screen.queryByText(/Signature Finger Lakes white wine/i)).not.toBeInTheDocument();
  });

  it('displays empty state when reviews do not mention any varietals and varietals prop is empty', () => {
    render(
      <WineryVarietalsTab
        varietals={[]}
        reviews={[{ text: 'Great views and lovely staff, highly recommend visiting.' }]}
      />
    );

    expect(screen.getByTestId('empty-varietals-state')).toBeInTheDocument();
    expect(screen.queryByText('Riesling')).not.toBeInTheDocument();
  });
});
