import { render, screen, fireEvent } from '@testing-library/react';
import AISettings from '../AISettings';

let mockUpdateAIEnabled = jest.fn();
let mockUser: any = { id: '1', name: 'Test', email: 'test@ex.com', ai_enabled: false };

jest.mock('@/lib/stores/userStore', () => ({
  useUserStore: (selector?: any) => {
    const state = {
      user: mockUser,
      updateAIEnabled: mockUpdateAIEnabled,
    };
    return selector ? selector(state) : state;
  },
}));

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

describe('AISettings Component', () => {
  beforeEach(() => {
    mockUpdateAIEnabled.mockClear();
    mockUser.ai_enabled = false;
  });

  it('renders AI settings card with switch unchecked by default', () => {
    render(<AISettings />);
    expect(screen.getByTestId('ai-settings-card')).toBeInTheDocument();
    expect(screen.getByText('AI Features')).toBeInTheDocument();
    const switchEl = screen.getByTestId('ai-features-switch');
    expect(switchEl).toBeInTheDocument();
    expect(switchEl).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByText('AI features are turned off by default.')).toBeInTheDocument();
  });

  it('renders checked switch when ai_enabled is true', () => {
    mockUser.ai_enabled = true;
    render(<AISettings />);
    const switchEl = screen.getByTestId('ai-features-switch');
    expect(switchEl).toHaveAttribute('data-state', 'checked');
    expect(screen.getByText('AI features are active across the app.')).toBeInTheDocument();
  });

  it('calls updateAIEnabled when switch is toggled', async () => {
    render(<AISettings />);
    const switchEl = screen.getByTestId('ai-features-switch');
    fireEvent.click(switchEl);
    expect(mockUpdateAIEnabled).toHaveBeenCalledWith(true);
  });
});
