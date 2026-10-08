import { render, screen, fireEvent } from "@testing-library/react";
import WineryMap from "../WineryMap";
import { useWineryMapContext } from "@/components/winery-map-context";
import { useMapStore } from "@/lib/stores/mapStore";

jest.mock("@/components/winery-map-context", () => ({
  useWineryMapContext: jest.fn(),
}));

jest.mock("../map/MapView", () => {
  return function MockMapView() {
    return <div data-testid="map-view-mock" />;
  };
});

describe("WineryMap", () => {
  const defaultContext = {
    error: null,
    isLoading: false,
    mapWineries: {
      discovered: [],
      visited: [],
      wishlist: [],
      favorites: [],
    },
    filter: ["all"],
    handleOpenModal: jest.fn(),
    proposedWinery: null,
    setProposedWinery: jest.fn(),
    selectedTrip: null,
    handleManualSearchArea: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders MapView with ready state when there is no error", () => {
    (useWineryMapContext as jest.Mock).mockReturnValue(defaultContext);

    render(<WineryMap />);

    const container = screen.getByTestId("map-container");
    expect(container).toBeInTheDocument();
    expect(container).toHaveAttribute("data-state", "ready");
    expect(screen.getByTestId("map-view-mock")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps MapView mounted and renders error alert as a floating overlay when error is present", () => {
    (useWineryMapContext as jest.Mock).mockReturnValue({
      ...defaultContext,
      error: "Failed to find wineries in this area. Please check your connection and try again.",
    });

    render(<WineryMap />);

    const container = screen.getByTestId("map-container");
    expect(container).toBeInTheDocument();
    expect(container).toHaveAttribute("data-state", "error");

    // Invariant: MapView must remain mounted even on error!
    expect(screen.getByTestId("map-view-mock")).toBeInTheDocument();

    // Floating alert overlay is displayed
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent("Failed to find wineries in this area. Please check your connection and try again.");
  });

  it("renders with loading state when isLoading is true", () => {
    (useWineryMapContext as jest.Mock).mockReturnValue({
      ...defaultContext,
      isLoading: true,
    });

    render(<WineryMap />);

    const container = screen.getByTestId("map-container");
    expect(container).toHaveAttribute("data-state", "loading");
    expect(screen.getByTestId("map-view-mock")).toBeInTheDocument();
  });

  it("renders FloatingSearchAreaButton when center distance from last search exceeds 5 km and autoSearch is false", () => {
    (useWineryMapContext as jest.Mock).mockReturnValue(defaultContext);
    useMapStore.setState({
      autoSearch: false,
      center: { lat: 42.80, lng: -76.90 },
      lastSearchedBounds: {
        north: 42.75,
        south: 42.65,
        east: -76.85,
        west: -76.95,
      },
    });

    render(<WineryMap />);

    expect(screen.getByRole("button", { name: /search this area/i })).toBeInTheDocument();
  });

  it("triggers handleManualSearchArea from context when FloatingSearchAreaButton is clicked", () => {
    const mockManualSearch = jest.fn();
    (useWineryMapContext as jest.Mock).mockReturnValue({
      ...defaultContext,
      handleManualSearchArea: mockManualSearch,
    });
    useMapStore.setState({
      autoSearch: false,
      center: { lat: 42.80, lng: -76.90 },
      lastSearchedBounds: {
        north: 42.75,
        south: 42.65,
        east: -76.85,
        west: -76.95,
      },
    });

    render(<WineryMap />);

    const button = screen.getByRole("button", { name: /search this area/i });
    fireEvent.click(button);
    expect(mockManualSearch).toHaveBeenCalledTimes(1);
  });
});
