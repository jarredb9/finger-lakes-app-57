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
});
