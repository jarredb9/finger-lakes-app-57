import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PlaceAutocomplete } from "../PlaceAutocomplete";
import { usePlacesAutocompleteSession } from "@/hooks/use-places-autocomplete-session";
import { standardizeWineryData } from "@/lib/utils/winery";

// Mock the autocomplete session hook
jest.mock("@/hooks/use-places-autocomplete-session", () => ({
  usePlacesAutocompleteSession: jest.fn(),
}));

// Mock winery standardizer
jest.mock("@/lib/utils/winery", () => ({
  standardizeWineryData: jest.fn(),
}));

describe("PlaceAutocomplete", () => {
  let mockFetchSuggestions: jest.Mock;
  let mockFetchPlaceDetails: jest.Mock;
  let mockSetSuggestions: jest.Mock;
  let mockOnPlaceSelect: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockFetchSuggestions = jest.fn();
    mockFetchPlaceDetails = jest.fn();
    mockSetSuggestions = jest.fn();
    mockOnPlaceSelect = jest.fn();

    (usePlacesAutocompleteSession as jest.Mock).mockReturnValue({
      suggestions: [],
      isLoading: false,
      fetchSuggestions: mockFetchSuggestions,
      fetchPlaceDetails: mockFetchPlaceDetails,
      setSuggestions: mockSetSuggestions,
      refreshSessionToken: jest.fn(),
    });
  });

  it("should render input field with default placeholder", () => {
    render(<PlaceAutocomplete onPlaceSelect={mockOnPlaceSelect} />);
    const input = screen.getByTestId("place-autocomplete-input");
    expect(input).toBeVisible();
    expect(input).toHaveAttribute("placeholder", "Search locations...");
  });

  it("should render suggestions when provided", async () => {
    const mockSuggestions = [
      {
        placePrediction: {
          toPlace: () => ({ id: "place-1" }),
          mainText: { text: "Mock Winery" },
          secondaryText: { text: "123 mock address" },
        },
      },
    ];

    (usePlacesAutocompleteSession as jest.Mock).mockReturnValue({
      suggestions: mockSuggestions,
      isLoading: false,
      fetchSuggestions: mockFetchSuggestions,
      fetchPlaceDetails: mockFetchPlaceDetails,
      setSuggestions: mockSetSuggestions,
      refreshSessionToken: jest.fn(),
    });

    render(<PlaceAutocomplete onPlaceSelect={mockOnPlaceSelect} />);
    
    // Simulate typing to trigger search and open state
    const input = screen.getByTestId("place-autocomplete-input");
    fireEvent.change(input, { target: { value: "mock winery" } });

    await waitFor(() => {
      expect(screen.getByTestId("place-autocomplete-results")).toBeVisible();
    });

    expect(screen.getByText("Mock Winery")).toBeVisible();
    expect(screen.getByText("123 mock address")).toBeVisible();
  });

  it("should fetch details and trigger callback when suggestion clicked", async () => {
    const mockSdkPlace = {
      id: "place-1",
      displayName: "Mock Winery",
      formattedAddress: "123 mock address",
      location: {
        lat: () => 42.5,
        lng: () => -76.8,
      },
    };

    const mockSuggestions = [
      {
        placePrediction: {
          toPlace: () => mockSdkPlace,
          mainText: { text: "Mock Winery" },
          secondaryText: { text: "123 mock address" },
        },
      },
    ];

    const mockWineryObj = {
      id: "place-1",
      name: "Mock Winery",
      address: "123 mock address",
      latitude: 42.5,
      longitude: -76.8,
    };

    (usePlacesAutocompleteSession as jest.Mock).mockReturnValue({
      suggestions: mockSuggestions,
      isLoading: false,
      fetchSuggestions: mockFetchSuggestions,
      fetchPlaceDetails: mockFetchPlaceDetails.mockResolvedValue(mockSdkPlace),
      setSuggestions: mockSetSuggestions,
      refreshSessionToken: jest.fn(),
    });

    (standardizeWineryData as jest.Mock).mockReturnValue(mockWineryObj);

    render(<PlaceAutocomplete onPlaceSelect={mockOnPlaceSelect} />);
    
    const input = screen.getByTestId("place-autocomplete-input");
    fireEvent.change(input, { target: { value: "mock winery" } });

    await waitFor(() => {
      expect(screen.getByTestId("place-autocomplete-results")).toBeVisible();
    });

    const suggestionBtn = screen.getByTestId("autocomplete-option-0");
    fireEvent.click(suggestionBtn);

    await waitFor(() => {
      expect(mockFetchPlaceDetails).toHaveBeenCalled();
      expect(standardizeWineryData).toHaveBeenCalled();
      expect(mockOnPlaceSelect).toHaveBeenCalledWith(mockWineryObj, mockSdkPlace);
    });
  });

  it("should have mobile-responsive text size classes (text-base sm:text-sm)", () => {
    render(<PlaceAutocomplete onPlaceSelect={mockOnPlaceSelect} />);
    const input = screen.getByTestId("place-autocomplete-input");
    expect(input).toHaveClass("text-base");
    expect(input).toHaveClass("sm:text-sm");
  });

  it("should call activeElement.blur() when a suggestion is selected", async () => {
    const mockSuggestions = [
      {
        placePrediction: {
          toPlace: () => ({ id: "place-1" }),
          mainText: { text: "Mock Winery" },
          secondaryText: { text: "123 mock address" },
        },
      },
    ];
    
    (usePlacesAutocompleteSession as jest.Mock).mockReturnValue({
      suggestions: mockSuggestions,
      isLoading: false,
      fetchSuggestions: mockFetchSuggestions,
      fetchPlaceDetails: mockFetchPlaceDetails.mockResolvedValue({ id: "place-1" }),
      setSuggestions: mockSetSuggestions,
      refreshSessionToken: jest.fn(),
    });

    render(<PlaceAutocomplete onPlaceSelect={mockOnPlaceSelect} />);
    
    const input = screen.getByTestId("place-autocomplete-input");
    input.focus();
    expect(document.activeElement).toBe(input);

    // Type and select
    fireEvent.change(input, { target: { value: "mock winery" } });
    await waitFor(() => {
      expect(screen.getByTestId("place-autocomplete-results")).toBeVisible();
    });

    const spyBlur = jest.spyOn(input, 'blur');
    const suggestionBtn = screen.getByTestId("autocomplete-option-0");
    fireEvent.click(suggestionBtn);

    await waitFor(() => {
      expect(spyBlur).toHaveBeenCalled();
    });
    spyBlur.mockRestore();
  });

  it("should intercept test winery selection and bypass fetchPlaceDetails", async () => {
    const { useWineryStore } = await import("@/lib/stores/wineryStore");
    const testWinery = {
      id: "test-winery-silent-valley",
      name: "Silent Valley Cellars (Test Winery)",
      address: "1000 Secret Hollow Rd",
      latitude: 42.45,
      longitude: -77.2,
    };
    useWineryStore.setState({ persistentWineries: [testWinery as any] });

    const mockSuggestions = [
      {
        placePrediction: {
          toPlace: () => ({ id: "test-winery-silent-valley" }),
          mainText: { text: "Silent Valley Cellars (Test Winery)" },
          secondaryText: { text: "1000 Secret Hollow Rd" },
        },
      },
    ];

    (usePlacesAutocompleteSession as jest.Mock).mockReturnValue({
      suggestions: mockSuggestions,
      isLoading: false,
      fetchSuggestions: mockFetchSuggestions,
      fetchPlaceDetails: mockFetchPlaceDetails,
      setSuggestions: mockSetSuggestions,
      refreshSessionToken: jest.fn(),
    });

    render(<PlaceAutocomplete onPlaceSelect={mockOnPlaceSelect} />);

    const input = screen.getByTestId("place-autocomplete-input");
    fireEvent.change(input, { target: { value: "Silent" } });

    await waitFor(() => {
      expect(screen.getByTestId("place-autocomplete-results")).toBeVisible();
    });

    const suggestionBtn = screen.getByTestId("autocomplete-option-0");
    fireEvent.click(suggestionBtn);

    await waitFor(() => {
      expect(mockOnPlaceSelect).toHaveBeenCalledWith(
        expect.objectContaining({ id: "test-winery-silent-valley" }),
        null
      );
    });

    expect(mockFetchPlaceDetails).not.toHaveBeenCalled();
  });

  describe("PlaceAutocomplete clearOnSelect & Re-Query Suppression Invariants", () => {
    it("clears inputValue upon successful suggestion selection when clearOnSelect is true", async () => {
      const mockSdkPlace = {
        id: "place-1",
        displayName: "Mock Winery",
        formattedAddress: "123 mock address",
        location: {
          lat: () => 42.5,
          lng: () => -76.8,
        },
      };

      const mockSuggestions = [
        {
          placePrediction: {
            toPlace: () => mockSdkPlace,
            text: { text: "Mock Winery" },
            mainText: { text: "Mock Winery" },
            secondaryText: { text: "123 mock address" },
          },
        },
      ];

      const mockWineryObj = {
        id: "place-1",
        name: "Mock Winery",
        address: "123 mock address",
        latitude: 42.5,
        longitude: -76.8,
      };

      (usePlacesAutocompleteSession as jest.Mock).mockReturnValue({
        suggestions: mockSuggestions,
        isLoading: false,
        fetchSuggestions: mockFetchSuggestions,
        fetchPlaceDetails: mockFetchPlaceDetails.mockResolvedValue(mockSdkPlace),
        setSuggestions: mockSetSuggestions,
        refreshSessionToken: jest.fn(),
      });

      (standardizeWineryData as jest.Mock).mockReturnValue(mockWineryObj);

      render(
        <PlaceAutocomplete
          onPlaceSelect={mockOnPlaceSelect}
          clearOnSelect={true}
        />
      );

      const input = screen.getByTestId("place-autocomplete-input");
      fireEvent.change(input, { target: { value: "mock winery" } });

      await waitFor(() => {
        expect(screen.getByTestId("place-autocomplete-results")).toBeVisible();
      });

      const suggestionBtn = screen.getByTestId("autocomplete-option-0");
      fireEvent.click(suggestionBtn);

      await waitFor(() => {
        expect(mockOnPlaceSelect).toHaveBeenCalledWith(mockWineryObj, mockSdkPlace);
      });

      expect(input).toHaveValue("");
    });

    it("does not trigger debounced fetchSuggestions or re-open the dropdown upon programmatic selection value updates", async () => {
      const mockSdkPlace = {
        id: "place-1",
        displayName: "Mock Winery",
        formattedAddress: "123 mock address",
        location: {
          lat: () => 42.5,
          lng: () => -76.8,
        },
      };

      const mockSuggestions = [
        {
          placePrediction: {
            toPlace: () => mockSdkPlace,
            text: { text: "Mock Winery" },
            mainText: { text: "Mock Winery" },
            secondaryText: { text: "123 mock address" },
          },
        },
      ];

      (usePlacesAutocompleteSession as jest.Mock).mockReturnValue({
        suggestions: mockSuggestions,
        isLoading: false,
        fetchSuggestions: mockFetchSuggestions,
        fetchPlaceDetails: mockFetchPlaceDetails.mockResolvedValue(mockSdkPlace),
        setSuggestions: mockSetSuggestions,
        refreshSessionToken: jest.fn(),
      });

      (standardizeWineryData as jest.Mock).mockReturnValue({
        id: "place-1",
        name: "Mock Winery",
        address: "123 mock address",
        latitude: 42.5,
        longitude: -76.8,
      });

      render(<PlaceAutocomplete onPlaceSelect={mockOnPlaceSelect} />);

      const input = screen.getByTestId("place-autocomplete-input");
      fireEvent.change(input, { target: { value: "mock winery" } });

      await waitFor(() => {
        expect(screen.getByTestId("place-autocomplete-results")).toBeVisible();
      });

      mockFetchSuggestions.mockClear();

      const suggestionBtn = screen.getByTestId("autocomplete-option-0");
      fireEvent.click(suggestionBtn);

      await waitFor(() => {
        expect(mockOnPlaceSelect).toHaveBeenCalled();
      });

      await new Promise((resolve) => setTimeout(resolve, 350));

      expect(mockFetchSuggestions).not.toHaveBeenCalled();
      expect(screen.queryByTestId("place-autocomplete-results")).not.toBeInTheDocument();
    });

    it("retains the typed search string and keeps dropdown closed when place details resolution fails", async () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const mockSuggestions = [
        {
          placePrediction: {
            toPlace: () => ({ id: "place-fail" }),
            text: { text: "Failing Winery Prediction Full Name" },
            mainText: { text: "Failing Winery" },
            secondaryText: { text: "999 Error Rd" },
          },
        },
      ];

      (usePlacesAutocompleteSession as jest.Mock).mockReturnValue({
        suggestions: mockSuggestions,
        isLoading: false,
        fetchSuggestions: mockFetchSuggestions,
        fetchPlaceDetails: mockFetchPlaceDetails.mockRejectedValue(
          new Error("Places API fetch failure")
        ),
        setSuggestions: mockSetSuggestions,
        refreshSessionToken: jest.fn(),
      });

      render(
        <PlaceAutocomplete
          onPlaceSelect={mockOnPlaceSelect}
          clearOnSelect={true}
        />
      );

      const input = screen.getByTestId("place-autocomplete-input");
      fireEvent.change(input, { target: { value: "Keuka Spring" } });

      await waitFor(() => {
        expect(screen.getByTestId("place-autocomplete-results")).toBeVisible();
      });

      const suggestionBtn = screen.getByTestId("autocomplete-option-0");
      fireEvent.click(suggestionBtn);

      await waitFor(() => {
        expect(mockFetchPlaceDetails).toHaveBeenCalled();
      });

      await new Promise((resolve) => setTimeout(resolve, 350));

      expect(mockOnPlaceSelect).not.toHaveBeenCalled();
      expect(input).toHaveValue("Keuka Spring");
      expect(screen.queryByTestId("place-autocomplete-results")).not.toBeInTheDocument();

      consoleErrorSpy.mockRestore();
    });

    it("retains the selected place text and keeps dropdown closed when clearOnSelect is false (MapSearchBar regression)", async () => {
      const mockSdkPlace = {
        id: "place-map-1",
        displayName: "Dr. Konstantin Frank",
        formattedAddress: "9749 Middle Rd, Hammondsport, NY",
        location: {
          lat: () => 42.55,
          lng: () => -77.18,
        },
      };

      const mockSuggestions = [
        {
          placePrediction: {
            toPlace: () => mockSdkPlace,
            text: { text: "Dr. Konstantin Frank Winery" },
            mainText: { text: "Dr. Konstantin Frank" },
            secondaryText: { text: "9749 Middle Rd, Hammondsport, NY" },
          },
        },
      ];

      const mockWineryObj = {
        id: "place-map-1",
        name: "Dr. Konstantin Frank Winery",
        address: "9749 Middle Rd, Hammondsport, NY",
        latitude: 42.55,
        longitude: -77.18,
      };

      (usePlacesAutocompleteSession as jest.Mock).mockReturnValue({
        suggestions: mockSuggestions,
        isLoading: false,
        fetchSuggestions: mockFetchSuggestions,
        fetchPlaceDetails: mockFetchPlaceDetails.mockResolvedValue(mockSdkPlace),
        setSuggestions: mockSetSuggestions,
        refreshSessionToken: jest.fn(),
      });

      (standardizeWineryData as jest.Mock).mockReturnValue(mockWineryObj);

      render(
        <PlaceAutocomplete
          onPlaceSelect={mockOnPlaceSelect}
          clearOnSelect={false}
        />
      );

      const input = screen.getByTestId("place-autocomplete-input");
      fireEvent.change(input, { target: { value: "Frank" } });

      await waitFor(() => {
        expect(screen.getByTestId("place-autocomplete-results")).toBeVisible();
      });

      mockFetchSuggestions.mockClear();

      const suggestionBtn = screen.getByTestId("autocomplete-option-0");
      fireEvent.click(suggestionBtn);

      await waitFor(() => {
        expect(mockOnPlaceSelect).toHaveBeenCalledWith(mockWineryObj, mockSdkPlace);
      });

      // Input must retain the selected place name
      expect(input).toHaveValue("Dr. Konstantin Frank Winery");

      // Wait past debounce interval
      await new Promise((resolve) => setTimeout(resolve, 350));

      expect(mockFetchSuggestions).not.toHaveBeenCalled();
      expect(screen.queryByTestId("place-autocomplete-results")).not.toBeInTheDocument();
    });
  });

  describe("Accessibility & WAI-ARIA Combobox Attributes", () => {
    it("renders combobox attributes and controls suggestions listbox with option selection", async () => {
      const mockSdkPlace = {
        id: "place-aria-1",
        displayName: "Wagner Vineyards",
        formattedAddress: "9322 NY-414, Lodi, NY",
        location: { lat: () => 42.6, lng: () => -76.9 },
      };

      const mockSuggestions = [
        {
          placePrediction: {
            toPlace: () => mockSdkPlace,
            text: { text: "Wagner Vineyards" },
            mainText: { text: "Wagner Vineyards" },
            secondaryText: { text: "9322 NY-414, Lodi, NY" },
          },
        },
      ];

      (usePlacesAutocompleteSession as jest.Mock).mockReturnValue({
        suggestions: mockSuggestions,
        isLoading: false,
        fetchSuggestions: mockFetchSuggestions,
        fetchPlaceDetails: mockFetchPlaceDetails.mockResolvedValue(mockSdkPlace),
        setSuggestions: mockSetSuggestions,
        refreshSessionToken: jest.fn(),
      });

      render(<PlaceAutocomplete onPlaceSelect={mockOnPlaceSelect} id="custom-autocomplete" />);

      const input = screen.getByTestId("place-autocomplete-input");
      expect(input).toHaveAttribute("role", "combobox");
      expect(input).toHaveAttribute("aria-autocomplete", "list");
      expect(input).toHaveAttribute("aria-expanded", "false");
      expect(input).toHaveAttribute("aria-haspopup", "listbox");
      expect(input).not.toHaveAttribute("aria-controls");

      // Open autocomplete dropdown
      fireEvent.change(input, { target: { value: "Wagner" } });

      await waitFor(() => {
        expect(screen.getByTestId("place-autocomplete-results")).toBeVisible();
      });

      expect(input).toHaveAttribute("aria-expanded", "true");
      expect(input).toHaveAttribute("aria-controls", "custom-autocomplete-results");

      const resultsList = screen.getByTestId("place-autocomplete-results");
      expect(resultsList).toHaveAttribute("role", "listbox");
      expect(resultsList).toHaveAttribute("id", "custom-autocomplete-results");
      expect(resultsList).toHaveAttribute("aria-label", "Location suggestions");

      const option0 = screen.getByTestId("autocomplete-option-0");
      expect(option0).toHaveAttribute("role", "option");
      expect(option0).toHaveAttribute("id", "custom-autocomplete-option-0");
      expect(option0).toHaveAttribute("aria-selected", "false");

      // Navigate down via keyboard
      fireEvent.keyDown(input, { key: "ArrowDown" });

      expect(input).toHaveAttribute("aria-activedescendant", "custom-autocomplete-option-0");
      expect(option0).toHaveAttribute("aria-selected", "true");
    });
  });
});

