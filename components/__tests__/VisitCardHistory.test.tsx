import { render, screen, fireEvent } from '@testing-library/react';
import VisitCardHistory from '../VisitCardHistory';
import { createMockVisit } from '../../test/factories/dataFactory';

// Mock PhotoCard to avoid side effects
jest.mock('../photo-card', () => {
  return function MockPhotoCard() {
    return <div data-testid="mock-photo-card" />;
  };
});

describe('VisitCardHistory', () => {
  const visits = [
    createMockVisit({ id: '1' as any, visit_date: '2026-03-01', user_review: 'Review 1', rating: 5 }),
    createMockVisit({ id: '2' as any, visit_date: '2026-03-02', user_review: 'Review 2', rating: 4 }),
  ];

  it('renders a list of visits sorted by date', () => {
    render(<VisitCardHistory visits={visits} />);
    
    const visitCards = screen.getAllByTestId('visit-card');
    expect(visitCards).toHaveLength(2);
    
    // Check sorting: March 2 should be first
    expect(screen.getByText(/March 2, 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/Review 2/i)).toBeInTheDocument();
  });

  it('triggers onEditClick when edit button is clicked', () => {
    const onEditClick = jest.fn();
    render(<VisitCardHistory visits={visits} onEditClick={onEditClick} />);
    
    const editButtons = screen.getAllByLabelText(/Edit visit/i);
    fireEvent.click(editButtons[0]); // This should be for Review 2 (sorted)
    
    expect(onEditClick).toHaveBeenCalledWith(visits[1]);
  });

  it('triggers onDeleteVisit when delete button is clicked', () => {
    const onDeleteVisit = jest.fn();
    render(<VisitCardHistory visits={visits} onDeleteVisit={onDeleteVisit} />);
    
    const deleteButtons = screen.getAllByLabelText(/Delete visit/i);
    fireEvent.click(deleteButtons[0]);
    
    expect(onDeleteVisit).toHaveBeenCalledWith('2');
  });
});
