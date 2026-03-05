import { render, screen } from '@testing-library/react';
import { TripShareDialog } from '../TripShareDialog';

describe('TripShareDialog', () => {
  it('renders the dialog title', () => {
    render(
      <TripShareDialog 
        isOpen={true} 
        onClose={() => {}} 
        tripName="Test Trip" 
        tripId="test-trip-id"
      />
    );
    
    expect(screen.getByText(/Share "Test Trip"/i)).toBeInTheDocument();
  });
});
