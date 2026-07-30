// @ts-nocheck
import { render, screen } from '@testing-library/react';
// @ts-ignore
import { WineryVarietalsTab } from '../WineryVarietalsTab';

import { useUserStore } from '@/lib/stores/userStore';

describe('WineryVarietalsTab Unit Tests', () => {
  beforeEach(() => {
    useUserStore.setState({ user: { id: 'test-user', ai_enabled: false } });
  });

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
        geminiTastingNotes="Known across the Finger Lakes for world-class Dry Riesling."
      />
    );

    expect(screen.getByText('Dry Riesling')).toBeInTheDocument();
    expect(screen.getByText('Crisp and mineral with white peach notes')).toBeInTheDocument();
    expect(screen.getByText('Cabernet Franc')).toBeInTheDocument();

    // Verify flavor profile sliders
    expect(screen.getAllByRole('slider')).toHaveLength(4); // 2 sliders per card x 2 cards
  });

  it('hides Gemini tasting notes when ai_enabled is false (default)', () => {
    useUserStore.setState({ user: { id: 'test-user', ai_enabled: false } });
    render(
      <WineryVarietalsTab
        varietals={mockVarietals}
        geminiTastingNotes="Known across the Finger Lakes for world-class Dry Riesling."
      />
    );

    expect(screen.queryByText(/Known across the Finger Lakes for world-class Dry Riesling/)).not.toBeInTheDocument();
  });

  it('renders Gemini tasting notes when ai_enabled is true', () => {
    useUserStore.setState({ user: { id: 'test-user', ai_enabled: true } });
    render(
      <WineryVarietalsTab
        varietals={mockVarietals}
        geminiTastingNotes="Known across the Finger Lakes for world-class Dry Riesling."
      />
    );

    expect(screen.getByText(/Known across the Finger Lakes for world-class Dry Riesling/)).toBeInTheDocument();
  });
});
