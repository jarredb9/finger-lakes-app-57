import { render, screen, fireEvent } from '@testing-library/react';
import TripCard from '../TripCardPresentational';
import { createMockTrip, createMockUser, createMockTripMember } from '../../test/factories/dataFactory';

// This test should NOT mock zustand stores.
// It will likely fail until TripCard is refactored to take these as props and STOP using stores.

describe('TripCard Presentational', () => {
  const trip = createMockTrip();
  const user = createMockUser();
  const currentMembers = [createMockTripMember()];

  const defaultProps: any = {
    trip,
    isOwner: true,
    canEdit: true,
    user,
    currentMembers,
    onUpdateTrip: jest.fn(),
    onDeleteTrip: jest.fn(),
    onUpdateWineryOrder: jest.fn(),
    onToggleWineryOnTrip: jest.fn(),
    onRemoveWineryFromTrip: jest.fn(),
    onSaveWineryNote: jest.fn(),
    onOpenShareDialog: jest.fn(),
    onOpenWineryNoteEditor: jest.fn(),
    onExportToMaps: jest.fn(),
  };

  it('renders correctly without store mocks', () => {
    render(<TripCard {...defaultProps} />);
    expect(screen.getByText(trip.name!)).toBeInTheDocument();
  });

  it('triggers onOpenShareDialog when share button is clicked', () => {
    render(<TripCard {...defaultProps} />);
    const shareButton = screen.getByLabelText(/Share Trip/i);
    fireEvent.click(shareButton);
    expect(defaultProps.onOpenShareDialog).toHaveBeenCalledWith(trip.id.toString(), trip.name);
  });
});
