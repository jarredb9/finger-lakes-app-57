import { render, screen } from "@testing-library/react";
import { MapErrorBoundary } from "../map-error-boundary";

describe("MapErrorBoundary Component", () => {
  const FallbackComponent = () => <div data-testid="map-error-fallback">Fallback Content</div>;
  const ThrowingComponent = ({ shouldThrow }: { shouldThrow: boolean }) => {
    if (shouldThrow) {
      throw new Error("Simulated WebGL Crash");
    }
    return <div data-testid="normal-child">Normal Child Content</div>;
  };

  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders children normally when no error occurs", () => {
    render(
      <MapErrorBoundary fallback={<FallbackComponent />}>
        <ThrowingComponent shouldThrow={false} />
      </MapErrorBoundary>
    );

    expect(screen.getByTestId("normal-child")).toBeInTheDocument();
    expect(screen.queryByTestId("map-error-fallback")).not.toBeInTheDocument();
  });

  it("catches rendering errors in children and renders the fallback", () => {
    render(
      <MapErrorBoundary fallback={<FallbackComponent />}>
        <ThrowingComponent shouldThrow={true} />
      </MapErrorBoundary>
    );

    expect(screen.getByTestId("map-error-fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("normal-child")).not.toBeInTheDocument();
  });

  it("invokes onError callback when a child throws", () => {
    const onErrorMock = jest.fn();

    render(
      <MapErrorBoundary fallback={<FallbackComponent />} onError={onErrorMock}>
        <ThrowingComponent shouldThrow={true} />
      </MapErrorBoundary>
    );

    expect(onErrorMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) })
    );
  });
});
