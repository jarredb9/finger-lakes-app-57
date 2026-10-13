import { render, screen, fireEvent } from "@testing-library/react";
import { FloatingSearchAreaButton } from "../floating-search-area-button";
import { useMapStore, SerializableBounds } from "@/lib/stores/mapStore";

describe("FloatingSearchAreaButton", () => {
  const sampleSearchedBounds: SerializableBounds = {
    north: 42.75,
    south: 42.65,
    east: -76.85,
    west: -76.95,
  }; // Center: lat 42.70, lng -76.90

  beforeEach(() => {
    useMapStore.getState().reset();
  });

  describe("Visibility Logic", () => {
    it("does not render when autoSearch is true", () => {
      // 11 km away, but autoSearch is true
      render(
        <FloatingSearchAreaButton
          autoSearch={true}
          lastSearchedBounds={sampleSearchedBounds}
          currentCenter={{ lat: 42.80, lng: -76.90 }}
        />
      );
      expect(screen.queryByRole("button", { name: /search this area/i })).not.toBeInTheDocument();
    });

    it("does not render when lastSearchedBounds is null", () => {
      render(
        <FloatingSearchAreaButton
          autoSearch={false}
          lastSearchedBounds={null}
          currentCenter={{ lat: 42.80, lng: -76.90 }}
        />
      );
      expect(screen.queryByRole("button", { name: /search this area/i })).not.toBeInTheDocument();
    });

    it("does not render when current center is within 5 km of last search center", () => {
      // ~2.2 km shift
      render(
        <FloatingSearchAreaButton
          autoSearch={false}
          lastSearchedBounds={sampleSearchedBounds}
          currentCenter={{ lat: 42.72, lng: -76.90 }}
        />
      );
      expect(screen.queryByRole("button", { name: /search this area/i })).not.toBeInTheDocument();
    });

    it("renders floating button when autoSearch is false and center distance exceeds 5 km", () => {
      // ~11.1 km shift
      render(
        <FloatingSearchAreaButton
          autoSearch={false}
          lastSearchedBounds={sampleSearchedBounds}
          currentCenter={{ lat: 42.80, lng: -76.90 }}
        />
      );
      const button = screen.getByRole("button", { name: /search this area/i });
      expect(button).toBeInTheDocument();
    });
  });

  describe("User Interactions & Loading State", () => {
    it("invokes onClick when clicked", () => {
      const handleClick = jest.fn();
      render(
        <FloatingSearchAreaButton
          autoSearch={false}
          lastSearchedBounds={sampleSearchedBounds}
          currentCenter={{ lat: 42.80, lng: -76.90 }}
          onClick={handleClick}
        />
      );

      const button = screen.getByRole("button", { name: /search this area/i });
      fireEvent.click(button);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("displays disabled state and loading indicator when isSearching is true", () => {
      render(
        <FloatingSearchAreaButton
          autoSearch={false}
          lastSearchedBounds={sampleSearchedBounds}
          currentCenter={{ lat: 42.80, lng: -76.90 }}
          isSearching={true}
        />
      );

      const button = screen.getByRole("button", { name: /search this area/i });
      expect(button).toBeDisabled();
      expect(button.querySelector("svg")).toBeInTheDocument();
    });
  });

  describe("Store Hydration (Container Mode)", () => {
    it("reads autoSearch, bounds, and center from useMapStore when props are omitted", () => {
      useMapStore.setState({
        autoSearch: false,
        lastSearchedBounds: sampleSearchedBounds,
        center: { lat: 42.80, lng: -76.90 },
      });

      render(<FloatingSearchAreaButton />);
      expect(screen.getByRole("button", { name: /search this area/i })).toBeInTheDocument();
    });
  });
});
