import { renderHook, act } from "@testing-library/react";
import { usePlacesAutocompleteSession } from "../use-places-autocomplete-session";
import { useMapsLibrary } from "@vis.gl/react-google-maps";

// Mock react-google-maps hook
jest.mock("@vis.gl/react-google-maps", () => ({
  useMapsLibrary: jest.fn(),
}));

describe("usePlacesAutocompleteSession", () => {
  let mockPlaces: any;
  let mockTokenInstance: any;
  let mockFetchSuggestions: jest.Mock;
  let mockPlaceInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockTokenInstance = { id: "mock-token-1" };
    mockFetchSuggestions = jest.fn();

    mockPlaceInstance = {
      id: "mock-place-id",
      fetchFields: jest.fn().mockResolvedValue({}),
      displayName: "Mocked Place",
      formattedAddress: "123 Mock Rd",
      location: {
        lat: () => 42.5,
        lng: () => -76.8,
      },
    };

    mockPlaces = {
      AutocompleteSessionToken: jest.fn().mockImplementation(() => mockTokenInstance),
      AutocompleteSuggestion: {
        fetchAutocompleteSuggestions: mockFetchSuggestions,
      },
      Place: jest.fn().mockImplementation(() => mockPlaceInstance),
    };

    (useMapsLibrary as jest.Mock).mockImplementation((lib) => {
      if (lib === "places") return mockPlaces;
      return null;
    });
  });

  it("should initialize a session token when the places library is loaded", () => {
    const { result } = renderHook(() => usePlacesAutocompleteSession());
    expect(mockPlaces.AutocompleteSessionToken).toHaveBeenCalled();
    expect(result.current.sessionToken).toBe(mockTokenInstance);
  });

  it("should fetch suggestions successfully", async () => {
    const mockSuggestions = [
      {
        placePrediction: {
          text: { text: "Mock Place" },
          mainText: { text: "Mock" },
          secondaryText: { text: "Place" },
          toPlace: () => mockPlaceInstance,
        },
      },
    ];

    mockFetchSuggestions.mockResolvedValue({ suggestions: mockSuggestions });

    const { result } = renderHook(() => usePlacesAutocompleteSession());

    await act(async () => {
      await result.current.fetchSuggestions("wine");
    });

    expect(mockFetchSuggestions).toHaveBeenCalledWith({
      input: "wine",
      sessionToken: mockTokenInstance,
    });
    expect(result.current.suggestions).toEqual(mockSuggestions);
    expect(result.current.isLoading).toBe(false);
  });

  it("should fetch place details, complete session, and refresh token", async () => {
    const mockSuggestion = {
      placePrediction: {
        text: { text: "Mock Place" },
        toPlace: jest.fn().mockReturnValue(mockPlaceInstance),
      },
    } as any;

    const { result } = renderHook(() => usePlacesAutocompleteSession());

    // Clear initial mock calls to track refresh
    mockPlaces.AutocompleteSessionToken.mockClear();

    let detailsResult;
    await act(async () => {
      detailsResult = await result.current.fetchPlaceDetails(mockSuggestion);
    });

    expect(mockSuggestion.placePrediction.toPlace).toHaveBeenCalled();
    expect(mockPlaceInstance.fetchFields).toHaveBeenCalled();
    expect(mockPlaces.AutocompleteSessionToken).toHaveBeenCalled(); // verified refresh token gets called
    expect(detailsResult).toBe(mockPlaceInstance);
  });
});
