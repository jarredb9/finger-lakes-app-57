import { render, screen, fireEvent } from '@testing-library/react';
import { MapSearchBar } from '../map-search-bar';

// Mock PlaceAutocomplete to inspect props cleanly
jest.mock('@/components/PlaceAutocomplete', () => ({
  PlaceAutocomplete: ({ onPlaceSelect, placeholder, className }: any) => (
    <div data-testid="place-autocomplete" className={className}>
      <input
        placeholder={placeholder}
        onChange={(e) => onPlaceSelect?.({ name: e.target.value }, {})}
        aria-label="Search place autocomplete"
      />
    </div>
  ),
}));

describe('MapSearchBar Component', () => {
  const defaultProps = {
    searchLocation: 'Keuka Lake',
    setSearchLocation: jest.fn(),
    isSearching: false,
    handleSearchSubmit: jest.fn((e) => e.preventDefault()),
    handleManualSearchArea: jest.fn(),
    autoSearch: false,
    setAutoSearch: jest.fn(),
    hitApiLimit: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders standard fallback search input when handlePlaceSelect is not provided', () => {
    render(<MapSearchBar {...defaultProps} />);

    const searchInput = screen.getByLabelText(/search location/i);
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toHaveValue('Keuka Lake');
    expect(searchInput).toHaveClass('min-h-[44px]');

    const submitBtn = screen.getByLabelText(/submit search/i);
    expect(submitBtn).toBeInTheDocument();
    expect(submitBtn).toHaveClass('min-h-[44px]');
    expect(submitBtn).toHaveClass('min-w-[44px]');
  });

  it('calls setSearchLocation when typing in fallback search input', () => {
    render(<MapSearchBar {...defaultProps} />);

    const searchInput = screen.getByLabelText(/search location/i);
    fireEvent.change(searchInput, { target: { value: 'Seneca Falls' } });

    expect(defaultProps.setSearchLocation).toHaveBeenCalledWith('Seneca Falls');
  });

  it('renders clear search button when searchLocation is provided and triggers clear callback', () => {
    const onClearSearch = jest.fn();
    render(<MapSearchBar {...defaultProps} searchLocation="Seneca Falls" onClearSearch={onClearSearch} />);

    const clearBtn = screen.getByLabelText(/clear search/i);
    expect(clearBtn).toBeInTheDocument();
    fireEvent.click(clearBtn);

    expect(onClearSearch).toHaveBeenCalledTimes(1);
  });

  it('calls handleSearchSubmit on form submission', () => {
    render(<MapSearchBar {...defaultProps} />);

    const submitBtn = screen.getByLabelText(/submit search/i);
    fireEvent.click(submitBtn);

    expect(defaultProps.handleSearchSubmit).toHaveBeenCalled();
  });

  it('renders PlaceAutocomplete when handlePlaceSelect is provided', () => {
    const handlePlaceSelect = jest.fn();
    render(<MapSearchBar {...defaultProps} handlePlaceSelect={handlePlaceSelect} />);

    expect(screen.getByTestId('place-autocomplete')).toBeInTheDocument();
    expect(screen.queryByLabelText(/search location/i)).not.toBeInTheDocument();
  });

  it('renders Search This Area button and handles click', () => {
    render(<MapSearchBar {...defaultProps} />);

    const manualBtn = screen.getByRole('button', { name: /search this area/i });
    expect(manualBtn).toBeInTheDocument();
    expect(manualBtn).toHaveClass('min-h-[44px]');

    fireEvent.click(manualBtn);
    expect(defaultProps.handleManualSearchArea).toHaveBeenCalledTimes(1);
  });

  it('disables Search This Area button and shows spinner when isSearching is true', () => {
    render(<MapSearchBar {...defaultProps} isSearching={true} />);

    const manualBtn = screen.getByRole('button', { name: /search this area/i });
    expect(manualBtn).toBeDisabled();

    const submitBtn = screen.getByLabelText(/submit search/i);
    expect(submitBtn).toBeDisabled();
  });

  it('renders Auto search switch and calls setAutoSearch on toggle', () => {
    render(<MapSearchBar {...defaultProps} autoSearch={false} />);

    const autoSwitch = screen.getByRole('switch', { name: /auto/i });
    expect(autoSwitch).toBeInTheDocument();
    fireEvent.click(autoSwitch);

    expect(defaultProps.setAutoSearch).toHaveBeenCalled();
  });

  it('renders API limit warning alert when hitApiLimit is true', () => {
    render(<MapSearchBar {...defaultProps} hitApiLimit={true} />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/zoom in to see more results/i);
  });
});
