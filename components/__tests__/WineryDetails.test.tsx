import { render, screen, fireEvent } from '@testing-library/react';
import WineryDetails from '../WineryDetails';
import { createMockWinery } from '@/lib/test-utils/fixtures';
import { useWineryStore } from '@/lib/stores/wineryStore';

// Mock QnA component since it calls complex sub-hooks
jest.mock('../WineryQnA', () => {
  return function DummyWineryQnA({ activeQuestionId }: { activeQuestionId?: string | null }) {
    return <div data-testid="winery-qna">{activeQuestionId ? `QnA Active: ${activeQuestionId}` : 'Winery QnA'}</div>;
  };
});

describe('WineryDetails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWineryStore.setState({
      loadingWineryId: null,
    });
  });

  it('renders base information correctly', () => {
    const winery = createMockWinery({
      name: 'Beautiful Estate',
      address: '789 Vineyard Rd',
      phone: '555-0199',
      website: 'https://beautifulestate.com',
      rating: 4.8,
      enrichment_tier: 'basic',
    });

    render(<WineryDetails winery={winery} />);
    
    expect(screen.getByText('789 Vineyard Rd')).toBeInTheDocument();
    expect(screen.getByText('555-0199')).toBeInTheDocument();
    expect(screen.getByText('Visit Website')).toHaveAttribute('href', 'https://beautifulestate.com');
    expect(screen.getByText('4.8/5.0')).toBeInTheDocument();
    expect(screen.getByText('(Google Reviews)')).toBeInTheDocument();
  });

  it('renders Gemini Insight when generative_summary is available', () => {
    const winery = createMockWinery({
      generative_summary: 'This is an awesome estate with great Riesling and beautiful lake views.',
      enrichment_tier: 'enriched',
    });

    render(<WineryDetails winery={winery} />);

    expect(screen.getByText('Gemini Insight')).toBeInTheDocument();
    expect(screen.getByText('Summarized with Gemini')).toBeInTheDocument();
    expect(screen.getByText('This is an awesome estate with great Riesling and beautiful lake views.')).toBeInTheDocument();
  });

  it('renders a skeleton when details loading or enrichment is pending', () => {
    const winery = createMockWinery({
      id: 'loading-winery-id' as any,
      enrichment_tier: undefined,
      generative_summary: null,
    });

    const { container } = render(<WineryDetails winery={winery} loadingWineryId={'loading-winery-id' as any} />);
    
    const containerEl = container.querySelector('.stable-gemini-container');
    expect(containerEl).toHaveAttribute('data-state', 'loading');
    expect(containerEl?.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders Service Limited banner when enrichment failed but enrichment_tier is enriched', () => {
    const winery = createMockWinery({
      enrichment_tier: 'enriched',
      generative_summary: null,
      primary_photo_reference: null,
    });

    render(<WineryDetails winery={winery} />);

    expect(screen.getByText('Service Limited: Rich details and AI summaries are currently unavailable.')).toBeInTheDocument();
  });

  it('renders Logistics & Accessibility accordion section correctly', () => {
    const winery = createMockWinery({
      allows_dogs: true,
      good_for_children: false,
      outdoor_seating: true,
      has_ev_charging: false,
      parking_options: { freeParking: true },
      accessibility_options: { wheelchairAccessibleEntrance: true },
      enrichment_tier: 'basic',
    });

    render(<WineryDetails winery={winery} />);

    const trigger = screen.getByRole('button', { name: /Logistics & Accessibility/i });
    fireEvent.click(trigger);

    expect(screen.getByText('Logistics & Accessibility')).toBeInTheDocument();
    
    // Check for specific labels
    expect(screen.getByText('Dogs Allowed:')).toBeInTheDocument();
    expect(screen.getByText('Kid Friendly:')).toBeInTheDocument();
    expect(screen.getByText('Outdoor:')).toBeInTheDocument();
    expect(screen.getByText('EV Charging:')).toBeInTheDocument();
    expect(screen.getByText('Free Parking:')).toBeInTheDocument();
    expect(screen.getByText('Wheelchair Acc.:')).toBeInTheDocument();
  });

  it('renders three-state logistics status correctly with Q&A review search fallback', () => {
    const winery = createMockWinery({
      allows_dogs: null, // Unknown with Q&A fallback
      good_for_children: false, // Explicitly No
      outdoor_seating: true, // Explicitly Yes
      has_ev_charging: null, // Unknown without Q&A fallback
      enrichment_tier: 'basic',
    });

    render(<WineryDetails winery={winery} />);

    const trigger = screen.getByRole('button', { name: /Logistics & Accessibility/i });
    fireEvent.click(trigger);

    // Outdoor Seating (true) should render status-yes (Check)
    const yesElements = screen.getAllByTestId('status-yes');
    expect(yesElements.length).toBeGreaterThan(0);

    // Kid Friendly (false) should render status-no (X)
    const noElements = screen.getAllByTestId('status-no');
    expect(noElements.length).toBeGreaterThan(0);

    // Dogs Allowed (null) should render the "Unknown (Ask Reviews)" button with fallback trigger
    const askReviewsBtn = screen.getByTestId('status-unknown-dogs');
    expect(askReviewsBtn).toBeInTheDocument();
    expect(screen.getByText('Unknown (Ask Reviews)')).toBeInTheDocument();

    // Verify multiple plain "Unknown" statuses exist (EV Charging, Free Parking, etc.)
    const unknownPlains = screen.getAllByTestId('status-unknown');
    expect(unknownPlains.length).toBeGreaterThan(0);
    expect(unknownPlains[0].textContent).toBe('Unknown');

    // Verify state trigger: QnA initially has no active question
    expect(screen.getByTestId('winery-qna').textContent).toBe('Winery QnA');

    // Click Dogs Allowed "Unknown (Ask Reviews)" button
    fireEvent.click(askReviewsBtn);

    // QnA component should now show that the dogs question is active
    expect(screen.getByTestId('winery-qna').textContent).toBe('QnA Active: dogs');
  });
});
