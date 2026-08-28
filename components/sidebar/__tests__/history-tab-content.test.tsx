import { render, screen, fireEvent } from '@testing-library/react';
import { HistoryTabContent } from '../history-tab-content';
import { useUIStore } from '@/lib/stores/uiStore';

jest.mock('@/components/global-visit-history', () => ({
  __esModule: true,
  default: ({ isActive }: { isActive?: boolean }) => (
    <div data-testid="mock-global-visit-history">
      Visit History List (active: {String(isActive)})
    </div>
  ),
}));

describe('HistoryTabContent Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useUIStore.setState({
      isHydrated: true,
      isVisitHistoryModalOpen: false,
    });
  });

  it('renders header, table view button, and GlobalVisitHistory', () => {
    render(<HistoryTabContent isActive={true} />);

    expect(screen.getByTestId('history-tab-content')).toBeInTheDocument();
    expect(screen.getByText('My Visit History')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view as table/i })).toBeInTheDocument();
    expect(screen.getByTestId('mock-global-visit-history')).toHaveTextContent('Visit History List (active: true)');
  });

  it('triggers setVisitHistoryModalOpen when clicking View as Table button', () => {
    render(<HistoryTabContent isActive={true} />);

    const button = screen.getByRole('button', { name: /view as table/i });
    fireEvent.click(button);

    expect(useUIStore.getState().isVisitHistoryModalOpen).toBe(true);
  });

  it('disables View as Table button when store is not hydrated', () => {
    useUIStore.setState({ isHydrated: false });

    render(<HistoryTabContent isActive={false} />);

    const button = screen.getByRole('button', { name: /view as table/i });
    expect(button).toBeDisabled();
    expect(screen.getByTestId('mock-global-visit-history')).toHaveTextContent('Visit History List (active: false)');
  });
});
