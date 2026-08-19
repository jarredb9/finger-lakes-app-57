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

  it('falls back to default Riesling card when no varietals or matching reviews exist', () => {
    render(
      <WineryVarietalsTab
        reviews={[]}
      />
    );

    expect(screen.getByText('Riesling')).toBeInTheDocument();
    expect(screen.getByText(/Signature Finger Lakes white wine/)).toBeInTheDocument();
  });
});
