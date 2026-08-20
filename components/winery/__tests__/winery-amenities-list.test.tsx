import { render, screen, fireEvent } from '@testing-library/react';
import { WineryAmenitiesList, WineryLogisticsAccordion } from '../winery-amenities-list';
import { createMockWinery } from '@/lib/test-utils/fixtures';

// Mock WineryQnA
jest.mock('../../WineryQnA', () => {
  return function DummyWineryQnA({ activeQuestionId }: { activeQuestionId?: string | null }) {
    return <div data-testid="winery-qna">{activeQuestionId ? `QnA Active: ${activeQuestionId}` : 'Winery QnA'}</div>;
  };
});

describe('WineryAmenitiesList', () => {
  it('renders all amenity rows and handles row clicks to open reviews modal', () => {
    const winery = createMockWinery({
      allows_dogs: true,
      good_for_children: false,
      outdoor_seating: true,
      has_ev_charging: null,
      parking_options: { freeParking: true },
      accessibility_options: { wheelchairAccessibleEntrance: true },
      reservable: null,
    });

    const handleSelectQuestion = jest.fn();

    render(
      <WineryAmenitiesList
        winery={winery}
        onSelectQuestion={handleSelectQuestion}
      />
    );

    const amenities = [
      'parking',
      'restrooms',
      'tasting_room',
      'dogs',
      'picnic_area',
      'ev_charging',
      'reservations',
      'tasting_fee',
      'outdoor',
      'kids',
      'wheelchair',
    ];

    amenities.forEach((key) => {
      expect(screen.getByTestId(`amenity-row-${key}`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('amenity-row-dogs'));
    expect(handleSelectQuestion).toHaveBeenCalledWith('dogs');
  });

  it('renders Sheet on desktop when an amenity question is active', () => {
    const winery = createMockWinery({
      allows_dogs: null,
    });

    render(
      <WineryAmenitiesList
        winery={winery}
        activeQuestionId="dogs"
        isMobile={false}
      />
    );

    expect(screen.getByTestId('amenity-reviews-sheet')).toBeInTheDocument();
    expect(screen.getByText('QnA Active: dogs')).toBeInTheDocument();
  });

  it('renders Drawer on mobile when an amenity question is active', () => {
    const winery = createMockWinery({
      allows_dogs: null,
    });

    render(
      <WineryAmenitiesList
        winery={winery}
        activeQuestionId="dogs"
        isMobile={true}
      />
    );

    expect(screen.getByTestId('amenity-reviews-drawer')).toBeInTheDocument();
    expect(screen.getByText('QnA Active: dogs')).toBeInTheDocument();
  });
});

describe('WineryLogisticsAccordion', () => {
  it('renders logistics status indicators', () => {
    const winery = createMockWinery({
      allows_dogs: true,
      good_for_children: false,
      outdoor_seating: true,
      has_ev_charging: false,
      parking_options: { freeParking: true },
      accessibility_options: { wheelchairAccessibleEntrance: true },
    });

    render(<WineryLogisticsAccordion winery={winery} />);

    expect(screen.getByText('Logistics & Accessibility')).toBeInTheDocument();
    expect(screen.getByText('Dogs Allowed:')).toBeInTheDocument();
    expect(screen.getByText('Kid Friendly:')).toBeInTheDocument();
    expect(screen.getByText('Outdoor:')).toBeInTheDocument();
    expect(screen.getByText('EV Charging:')).toBeInTheDocument();
    expect(screen.getByText('Free Parking:')).toBeInTheDocument();
    expect(screen.getByText('Wheelchair Acc.:')).toBeInTheDocument();
  });
});
