import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WineryNoteModal } from '../WineryNoteModal';
import { useUIStore } from '@/lib/stores/uiStore';

// Mock useUIStore
jest.mock('@/lib/stores/uiStore');

describe('WineryNoteModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly when activeNoteWineryDbId is set', async () => {
    const onNoteSave = jest.fn();
    (useUIStore as any).mockReturnValue({
      isModalOpen: true,
      activeNoteWineryDbId: 101,
      activeNoteInitialValue: 'Old Note',
      onNoteSave,
      closeWineryNoteEditor: jest.fn(),
      modalTitle: 'Winery Notes',
      modalDescription: 'Notes for Test Winery',
    });

    render(<WineryNoteModal />);
    
    await waitFor(() => {
      expect(screen.getByTestId('note-modal')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Winery Notes')).toBeInTheDocument();
    expect(screen.getByText('Notes for Test Winery')).toBeInTheDocument();
    
    const textarea = screen.getByPlaceholderText(/Add private notes for this winery/i);
    expect(textarea).toHaveValue('Old Note');

    fireEvent.change(textarea, { target: { value: 'New Note' } });
    fireEvent.click(screen.getByText('Save Notes'));

    expect(onNoteSave).toHaveBeenCalledWith(101, 'New Note');
  });

  it('does not render when activeNoteWineryDbId is null', () => {
    (useUIStore as any).mockReturnValue({
      isModalOpen: true,
      activeNoteWineryDbId: null,
      closeWineryNoteEditor: jest.fn(),
    });

    render(<WineryNoteModal />);
    expect(screen.queryByTestId('note-modal')).not.toBeInTheDocument();
  });

  it('does not render when isModalOpen is false', () => {
    (useUIStore as any).mockReturnValue({
      isModalOpen: false,
      activeNoteWineryDbId: 101,
      closeWineryNoteEditor: jest.fn(),
    });

    render(<WineryNoteModal />);
    expect(screen.queryByTestId('note-modal')).not.toBeInTheDocument();
  });
});
