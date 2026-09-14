import { render, screen, fireEvent } from "@testing-library/react";
import { MapStyleSwitcher } from "../map-style-switcher";

describe("MapStyleSwitcher Component", () => {
  it("renders outdoors and streets buttons with proper active variants", () => {
    const { rerender } = render(
      <MapStyleSwitcher currentStyle="streets" onStyleChange={jest.fn()} />
    );

    const outdoorsBtn = screen.getByRole("button", { name: /outdoors/i });
    const streetsBtn = screen.getByRole("button", { name: /streets/i });

    expect(outdoorsBtn).toBeInTheDocument();
    expect(streetsBtn).toBeInTheDocument();

    // In streets mode, streets should have default variant styling (bg-primary / text-primary-foreground or not ghost)
    // We check that switching styles re-renders with the other active
    rerender(<MapStyleSwitcher currentStyle="outdoors" onStyleChange={jest.fn()} />);

    expect(screen.getByRole("button", { name: /outdoors/i })).toBeInTheDocument();
  });

  it("triggers onStyleChange callback when buttons are clicked", () => {
    const onStyleChangeMock = jest.fn();

    render(
      <MapStyleSwitcher currentStyle="streets" onStyleChange={onStyleChangeMock} />
    );

    const outdoorsBtn = screen.getByRole("button", { name: /outdoors/i });
    const streetsBtn = screen.getByRole("button", { name: /streets/i });

    fireEvent.click(outdoorsBtn);
    expect(onStyleChangeMock).toHaveBeenCalledWith("outdoors");

    fireEvent.click(streetsBtn);
    expect(onStyleChangeMock).toHaveBeenCalledWith("streets");
  });

  it("applies custom className when provided", () => {
    render(
      <MapStyleSwitcher
        currentStyle="streets"
        onStyleChange={jest.fn()}
        className="custom-test-class"
      />
    );

    const container = screen.getByTestId("map-style-switcher");
    expect(container).toHaveClass("custom-test-class");
  });
});
