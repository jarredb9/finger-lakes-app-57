import { render, screen, waitFor } from '@testing-library/react';
import { VisitFormModal } from '../VisitFormModal';
import { useUIStore } from '@/lib/stores/uiStore';
import { useVisitStore } from '@/lib/stores/visitStore';
import { createMockWinery } from '@/lib/test-utils/fixtures';
import { GooglePlaceId } from '@/lib/types';

// Mock stores
jest.mock('@/lib/stores/uiStore');
jest.mock('@/lib/stores/visitStore');
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

// Mock VisitForm since it's a heavy child
jest.mock('../VisitForm', () => {
  const VisitForm = ({ editingVisit }: any) => (
    <div data-testid="visit-form-mock">
      {editingVisit && <span>Editing: {editingVisit.id}</span>}
      <span>Visit Form Content</span>
    </div>
  );
  VisitForm.displayName = 'VisitForm';
  return VisitForm;
});

describe('VisitFormModal', () => {
  const mockWinery = createMockWinery({ id: 'winery-1' as GooglePlaceId, name: 'Test Winery' });

  beforeEach(() => {
    jest.clearAllMocks();
    (useVisitStore as any).mockReturnValue({
      saveVisit: jest.fn(),
      updateVisit: jest.fn(),
      isSavingVisit: false,
    });
  });

  it('renders VisitForm when isModalOpen and activeVisitWinery are set', async () => {
    (useUIStore as any).mockReturnValue({
      isModalOpen: true,
      activeVisitWinery: mockWinery,
      editingVisit: null,
      modalTitle: 'Add Visit',
      modalDescription: 'Add a new visit record',
      closeVisitForm: jest.fn(),
    });

    render(<VisitFormModal />);
    
    await waitFor(() => {
      expect(screen.getByTestId('visit-modal')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Add Visit')).toBeInTheDocument();
    expect(screen.getByText('Add a new visit record')).toBeInTheDocument();
    expect(screen.getByTestId('visit-form-mock')).toBeInTheDocument();
  });

  it('renders with editingVisit if provided', async () => {
    (useUIStore as any).mockReturnValue({
      isModalOpen: true,
      activeVisitWinery: mockWinery,
      editingVisit: { id: 123 },
      modalTitle: 'Edit Visit',
      closeVisitForm: jest.fn(),
    });

    render(<VisitFormModal />);
    
    await waitFor(() => {
      expect(screen.getByTestId('visit-modal')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Editing: 123')).toBeInTheDocument();
  });

  it('does not render when isModalOpen is false', () => {
    (useUIStore as any).mockReturnValue({
      isModalOpen: false,
      activeVisitWinery: mockWinery,
      closeVisitForm: jest.fn(),
    });

    render(<VisitFormModal />);
    expect(screen.queryByTestId('visit-modal')).not.toBeInTheDocument();
  });

  it('does not render when activeVisitWinery is null', () => {
    (useUIStore as any).mockReturnValue({
      isModalOpen: true,
      activeVisitWinery: null,
      closeVisitForm: jest.fn(),
    });

    render(<VisitFormModal />);
    expect(screen.queryByTestId('visit-modal')).not.toBeInTheDocument();
  });
});
