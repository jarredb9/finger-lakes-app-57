import { render, screen, fireEvent } from "@testing-library/react";
import { PlaceAutocompleteSuggestionsList } from "../PlaceAutocompleteSuggestionsList";

// Mock GoogleAttribution to keep unit test isolated
jest.mock("../GoogleAttribution", () => ({
  GoogleAttribution: () => <div data-testid="google-attribution">Powered by Google</div>,
}));

describe("PlaceAutocompleteSuggestionsList", () => {
  const mockSuggestions = [
    {
      placePrediction: {
        toPlace: () => ({ id: "place-1" }),
        mainText: { text: "Boundary Breaks Vineyard" },
        secondaryText: { text: "1568 Porter Covert Rd, Lodi, NY" },
      },
    },
    {
      placePrediction: {
        toPlace: () => ({ id: "place-2" }),
        mainText: { text: "Wagner Vineyards" },
        secondaryText: { text: "9322 NY-414, Lodi, NY" },
      },
    },
  ] as unknown as google.maps.places.AutocompleteSuggestion[];

  let mockOnSelect: jest.Mock;

  beforeEach(() => {
    mockOnSelect = jest.fn();
  });

  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <PlaceAutocompleteSuggestionsList
        suggestions={mockSuggestions}
        isOpen={false}
        activeIndex={-1}
        onSelectSuggestion={mockOnSelect}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when suggestions array is empty", () => {
    const { container } = render(
      <PlaceAutocompleteSuggestionsList
        suggestions={[]}
        isOpen={true}
        activeIndex={-1}
        onSelectSuggestion={mockOnSelect}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders all suggestion items with main and secondary text", () => {
    render(
      <PlaceAutocompleteSuggestionsList
        suggestions={mockSuggestions}
        isOpen={true}
        activeIndex={-1}
        onSelectSuggestion={mockOnSelect}
      />
    );

    expect(screen.getByTestId("place-autocomplete-results")).toBeVisible();
    expect(screen.getByText("Boundary Breaks Vineyard")).toBeVisible();
    expect(screen.getByText("1568 Porter Covert Rd, Lodi, NY")).toBeVisible();
    expect(screen.getByText("Wagner Vineyards")).toBeVisible();
    expect(screen.getByText("9322 NY-414, Lodi, NY")).toBeVisible();
    expect(screen.getByTestId("google-attribution")).toBeVisible();
  });

  it("applies active/highlighted styles to the activeIndex option", () => {
    render(
      <PlaceAutocompleteSuggestionsList
        suggestions={mockSuggestions}
        isOpen={true}
        activeIndex={1}
        onSelectSuggestion={mockOnSelect}
      />
    );

    const option0 = screen.getByTestId("autocomplete-option-0");
    const option1 = screen.getByTestId("autocomplete-option-1");

    expect(option0).not.toHaveClass("bg-accent");
    expect(option1).toHaveClass("bg-accent");
    expect(option1).toHaveClass("text-accent-foreground");
  });

  it("calls onSelectSuggestion when a suggestion button is clicked", () => {
    render(
      <PlaceAutocompleteSuggestionsList
        suggestions={mockSuggestions}
        isOpen={true}
        activeIndex={-1}
        onSelectSuggestion={mockOnSelect}
      />
    );

    const option0 = screen.getByTestId("autocomplete-option-0");
    fireEvent.click(option0);

    expect(mockOnSelect).toHaveBeenCalledTimes(1);
    expect(mockOnSelect).toHaveBeenCalledWith(mockSuggestions[0]);
  });
});
