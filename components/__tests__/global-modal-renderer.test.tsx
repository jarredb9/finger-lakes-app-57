import { render, screen } from '@testing-library/react';
import { GlobalModalRenderer } from '../global-modal-renderer';
import { useUIStore } from '@/lib/stores/uiStore';

// Mock useUIStore
jest.mock('@/lib/stores/uiStore');

describe('GlobalModalRenderer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders general modal content when modalContent is set', () => {
    (useUIStore as any).mockReturnValue({
      isModalOpen: true,
      modalTitle: 'General Modal',
      modalDescription: 'General Description',
      modalContent: <div data-testid="general-content">Content</div>,
      closeModal: jest.fn(),
    });

    render(<GlobalModalRenderer />);
    expect(screen.getByTestId('global-modal')).toBeInTheDocument();
    expect(screen.getByText('General Modal')).toBeInTheDocument();
    expect(screen.getByText('General Description')).toBeInTheDocument();
    expect(screen.getByTestId('general-content')).toBeInTheDocument();
  });

  it('does not render when modalContent is null', () => {
    (useUIStore as any).mockReturnValue({
      isModalOpen: true,
      modalTitle: 'General Modal',
      modalContent: null,
      closeModal: jest.fn(),
    });

    render(<GlobalModalRenderer />);
    expect(screen.queryByTestId('global-modal')).not.toBeInTheDocument();
  });

  it('does not render when isModalOpen is false', () => {
    (useUIStore as any).mockReturnValue({
      isModalOpen: false,
      modalTitle: 'General Modal',
      modalContent: <div data-testid="general-content">Content</div>,
      closeModal: jest.fn(),
    });

    render(<GlobalModalRenderer />);
    expect(screen.queryByTestId('global-modal')).not.toBeInTheDocument();
  });
});
