import { render, screen, fireEvent } from '@testing-library/react';
import { GlobalModalRenderer } from '../global-modal-renderer';
import { useUIStore } from '@/lib/stores/uiStore';
import { createMockWinery } from '@/lib/test-utils/fixtures';
import { GooglePlaceId } from '@/lib/types';

// Mock useUIStore
jest.mock('@/lib/stores/uiStore');

// Mock VisitForm
jest.mock('../VisitForm', () => {
  const VisitForm = ({ winery, editingVisit, onCancelEdit }: any) => (
    <div data-testid="visit-form-mock">
      <span>Winery: {winery.name}</span>
      {editingVisit && <span>Editing: {editingVisit.id}</span>}
      <button onClick={onCancelEdit}>Cancel</button>
    </div>
  );
  VisitForm.displayName = 'VisitForm';
  return VisitForm;
});

// Mock toast
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

describe('GlobalModalRenderer', () => {
  const mockWinery = createMockWinery({ id: 'winery-1' as GooglePlaceId, name: 'Global Winery' });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders VisitForm when activeVisitWinery is set', () => {
    (useUIStore as any).mockReturnValue({
      isModalOpen: true,
      activeVisitWinery: mockWinery,
      editingVisit: null,
      closeVisitForm: jest.fn(),
      activeNoteWineryDbId: null,
    });

    render(<GlobalModalRenderer />);
    expect(screen.getByTestId('visit-form-mock')).toBeInTheDocument();
    expect(screen.getByText('Winery: Global Winery')).toBeInTheDocument();
  });

  it('renders WineryNoteEditor modal when activeNoteWineryDbId is set', () => {
    const onNoteSave = jest.fn();
    (useUIStore as any).mockReturnValue({
      isModalOpen: true,
      modalTitle: 'Winery Notes',
      activeVisitWinery: null,
      activeNoteWineryDbId: 101,
      activeNoteInitialValue: 'Old Note',
      onNoteSave,
      closeWineryNoteEditor: jest.fn(),
    });

    render(<GlobalModalRenderer />);
    
    expect(screen.getByText('Winery Notes')).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText(/Add private notes/i);
    expect(textarea).toHaveValue('Old Note');

    fireEvent.change(textarea, { target: { value: 'New Note' } });
    fireEvent.click(screen.getByText('Save Notes'));

    expect(onNoteSave).toHaveBeenCalledWith(101, 'New Note');
  });

  it('renders general modal content when modalContent is set', () => {
    (useUIStore as any).mockReturnValue({
      isModalOpen: true,
      modalTitle: 'General Modal',
      modalContent: <div data-testid="general-content">Content</div>,
      activeVisitWinery: null,
      activeNoteWineryDbId: null,
      closeModal: jest.fn(),
    });

    render(<GlobalModalRenderer />);
    expect(screen.getByTestId('general-content')).toBeInTheDocument();
  });
});
