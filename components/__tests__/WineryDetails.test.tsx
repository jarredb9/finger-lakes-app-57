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
    expect(askReviewsBtn).toHaveTextContent('Unknown (Ask Reviews)');

    // Verify multiple "Unknown (Ask Reviews)" statuses exist (EV Charging, Free Parking, etc.)
    const unknownButtons = screen.getAllByText('Unknown (Ask Reviews)');
    expect(unknownButtons.length).toBeGreaterThan(1);
    
    // Check specific one that was previously expected to be plain unknown
    expect(screen.getByTestId('status-unknown-ev_charging')).toBeInTheDocument();

    // Verify state trigger: QnA initially has no active question
    expect(screen.getByTestId('winery-qna').textContent).toBe('Winery QnA');

    // Click Dogs Allowed "Unknown (Ask Reviews)" button
    fireEvent.click(askReviewsBtn);

    // QnA component should now show that the dogs question is active
    expect(screen.getByTestId('winery-qna').textContent).toBe('QnA Active: dogs');
  });

  it('renders all 8 amenities in the list and clicking them triggers the reviews panel', () => {
    const winery = createMockWinery({
      allows_dogs: true,
      good_for_children: true,
      outdoor_seating: true,
      has_ev_charging: true,
      parking_options: { freeParking: true },
      accessibility_options: { wheelchairAccessibleEntrance: true },
      reservable: null, // Unknown/Ask reviews for reservations
      // tasting_fee is reviews-backed (not a Winery type property), so not set here
      enrichment_tier: 'basic',
    });

    render(<WineryDetails winery={winery} />);

    // Assert that we have rows/triggers for all 8 amenities:
    // Parking, Restrooms, Tasting Room, Dog Friendly, Picnic Area, EV Charging, Reservations Required, Tasting Fee
    const amenities = [
      'parking',
      'restrooms',
      'tasting_room',
      'dogs',
      'picnic_area',
      'ev_charging',
      'reservations',
      'tasting_fee'
    ];

    amenities.forEach((key) => {
      const row = screen.getByTestId(`amenity-row-${key}`);
      expect(row).toBeInTheDocument();
    });

    // Click on Reservations Required row and verify it triggers reviews panel / QnA active question
    const reservationsRow = screen.getByTestId('amenity-row-reservations');
    fireEvent.click(reservationsRow);
    expect(screen.getByTestId('winery-qna').textContent).toBe('QnA Active: reservations');

    // Click on Tasting Fee row and verify it triggers reviews panel / QnA active question
    const tastingFeeRow = screen.getByTestId('amenity-row-tasting_fee');
    fireEvent.click(tastingFeeRow);
    expect(screen.getByTestId('winery-qna').textContent).toBe('QnA Active: tasting_fee');
  });

  it('clicking an amenity row on desktop triggers a Side-Sheet (Sheet component) for reviews', () => {
    // Simulate desktop viewport
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
    window.dispatchEvent(new Event('resize'));

    const winery = createMockWinery({
      allows_dogs: null,
      has_ev_charging: null,
      parking_options: { freeParking: null },
      enrichment_tier: 'enriched',
      reviews: [
        {
          author_name: 'Test Reviewer',
          text: 'The parking lot was very spacious and free.',
          relative_time_description: '3 days ago',
          rating: 5,
          time: Date.now(),
        },
      ],
    });

    render(<WineryDetails winery={winery} />);

    // Click the parking amenity row
    const parkingRow = screen.getByTestId('amenity-row-parking');
    fireEvent.click(parkingRow);

    // On desktop, a Sheet (side-sheet) should slide in from the right
    const sideSheet = screen.getByTestId('amenity-reviews-sheet');
    expect(sideSheet).toBeInTheDocument();
    expect(sideSheet).toBeVisible();
  });

  it('clicking an amenity row on mobile triggers a Sub-Drawer for reviews', () => {
    // Simulate mobile viewport
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
    window.dispatchEvent(new Event('resize'));

    const winery = createMockWinery({
      allows_dogs: null,
      has_ev_charging: null,
      enrichment_tier: 'enriched',
      reviews: [
        {
          author_name: 'Mobile Reviewer',
          text: 'Dogs are welcome on the patio!',
          relative_time_description: '1 week ago',
          rating: 4,
          time: Date.now(),
        },
      ],
    });

    render(<WineryDetails winery={winery} />);

    // Click the dogs amenity row
    const dogsRow = screen.getByTestId('amenity-row-dogs');
    fireEvent.click(dogsRow);

    // On mobile, a sub-drawer should slide up from the bottom
    const subDrawer = screen.getByTestId('amenity-reviews-drawer');
    expect(subDrawer).toBeInTheDocument();
    expect(subDrawer).toBeVisible();
  });
});
