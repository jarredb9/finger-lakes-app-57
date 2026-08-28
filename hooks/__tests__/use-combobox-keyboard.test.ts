import { renderHook, act } from "@testing-library/react";
import { useComboboxKeyboard } from "../use-combobox-keyboard";
import React from "react";

describe("useComboboxKeyboard", () => {
  const mockItems = ["Item 1", "Item 2", "Item 3"];
  let mockOnSelect: jest.Mock;
  let mockOnOpenChange: jest.Mock;

  beforeEach(() => {
    mockOnSelect = jest.fn();
    mockOnOpenChange = jest.fn();
  });

  it("initializes with activeIndex at -1", () => {
    const { result } = renderHook(() =>
      useComboboxKeyboard({
        items: mockItems,
        isOpen: true,
        onOpenChange: mockOnOpenChange,
        onSelect: mockOnSelect,
      })
    );

    expect(result.current.activeIndex).toBe(-1);
  });

  it("navigates down with ArrowDown and wraps to 0", () => {
    const { result } = renderHook(() =>
      useComboboxKeyboard({
        items: mockItems,
        isOpen: true,
        onOpenChange: mockOnOpenChange,
        onSelect: mockOnSelect,
      })
    );

    const createKeyboardEvent = (key: string) =>
      ({
        key,
        preventDefault: jest.fn(),
      } as unknown as React.KeyboardEvent<HTMLElement>);

    // First ArrowDown -> index 0
    act(() => {
      result.current.handleKeyDown(createKeyboardEvent("ArrowDown"));
    });
    expect(result.current.activeIndex).toBe(0);

    // Second ArrowDown -> index 1
    act(() => {
      result.current.handleKeyDown(createKeyboardEvent("ArrowDown"));
    });
    expect(result.current.activeIndex).toBe(1);

    // Third ArrowDown -> index 2
    act(() => {
      result.current.handleKeyDown(createKeyboardEvent("ArrowDown"));
    });
    expect(result.current.activeIndex).toBe(2);

    // Fourth ArrowDown -> wrap to 0
    act(() => {
      result.current.handleKeyDown(createKeyboardEvent("ArrowDown"));
    });
    expect(result.current.activeIndex).toBe(0);
  });

  it("navigates up with ArrowUp and wraps to items.length - 1", () => {
    const { result } = renderHook(() =>
      useComboboxKeyboard({
        items: mockItems,
        isOpen: true,
        onOpenChange: mockOnOpenChange,
        onSelect: mockOnSelect,
      })
    );

    const createKeyboardEvent = (key: string) =>
      ({
        key,
        preventDefault: jest.fn(),
      } as unknown as React.KeyboardEvent<HTMLElement>);

    // ArrowUp from initial -1 -> wrap to last item (index 2)
    act(() => {
      result.current.handleKeyDown(createKeyboardEvent("ArrowUp"));
    });
    expect(result.current.activeIndex).toBe(2);

    // ArrowUp from 2 -> index 1
    act(() => {
      result.current.handleKeyDown(createKeyboardEvent("ArrowUp"));
    });
    expect(result.current.activeIndex).toBe(1);
  });

  it("selects active item on Enter key", () => {
    const { result } = renderHook(() =>
      useComboboxKeyboard({
        items: mockItems,
        isOpen: true,
        onOpenChange: mockOnOpenChange,
        onSelect: mockOnSelect,
      })
    );

    const createKeyboardEvent = (key: string) =>
      ({
        key,
        preventDefault: jest.fn(),
      } as unknown as React.KeyboardEvent<HTMLElement>);

    // Move to Item 2
    act(() => {
      result.current.handleKeyDown(createKeyboardEvent("ArrowDown"));
    });
    act(() => {
      result.current.handleKeyDown(createKeyboardEvent("ArrowDown"));
    });

    act(() => {
      result.current.handleKeyDown(createKeyboardEvent("Enter"));
    });

    expect(mockOnSelect).toHaveBeenCalledWith("Item 2");
  });

  it("does not trigger onSelect on Enter if activeIndex is -1", () => {
    const { result } = renderHook(() =>
      useComboboxKeyboard({
        items: mockItems,
        isOpen: true,
        onOpenChange: mockOnOpenChange,
        onSelect: mockOnSelect,
      })
    );

    const createKeyboardEvent = (key: string) =>
      ({
        key,
        preventDefault: jest.fn(),
      } as unknown as React.KeyboardEvent<HTMLElement>);

    act(() => {
      result.current.handleKeyDown(createKeyboardEvent("Enter"));
    });

    expect(mockOnSelect).not.toHaveBeenCalled();
  });

  it("closes dropdown on Escape key", () => {
    const { result } = renderHook(() =>
      useComboboxKeyboard({
        items: mockItems,
        isOpen: true,
        onOpenChange: mockOnOpenChange,
        onSelect: mockOnSelect,
      })
    );

    const createKeyboardEvent = (key: string) =>
      ({
        key,
        preventDefault: jest.fn(),
      } as unknown as React.KeyboardEvent<HTMLElement>);

    act(() => {
      result.current.handleKeyDown(createKeyboardEvent("Escape"));
    });

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("handles outside mousedown clicks to close dropdown", () => {
    const containerDiv = document.createElement("div");
    const outsideDiv = document.createElement("div");
    document.body.appendChild(containerDiv);
    document.body.appendChild(outsideDiv);

    const containerRef = { current: containerDiv };

    renderHook(() =>
      useComboboxKeyboard({
        items: mockItems,
        isOpen: true,
        onOpenChange: mockOnOpenChange,
        onSelect: mockOnSelect,
        containerRef,
      })
    );

    act(() => {
      const mouseEvent = new MouseEvent("mousedown", { bubbles: true });
      outsideDiv.dispatchEvent(mouseEvent);
    });

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);

    document.body.removeChild(containerDiv);
    document.body.removeChild(outsideDiv);
  });

  it("does not close on mousedown inside container", () => {
    const containerDiv = document.createElement("div");
    const insideDiv = document.createElement("div");
    containerDiv.appendChild(insideDiv);
    document.body.appendChild(containerDiv);

    const containerRef = { current: containerDiv };

    renderHook(() =>
      useComboboxKeyboard({
        items: mockItems,
        isOpen: true,
        onOpenChange: mockOnOpenChange,
        onSelect: mockOnSelect,
        containerRef,
      })
    );

    act(() => {
      const mouseEvent = new MouseEvent("mousedown", { bubbles: true });
      insideDiv.dispatchEvent(mouseEvent);
    });

    expect(mockOnOpenChange).not.toHaveBeenCalled();

    document.body.removeChild(containerDiv);
  });
});
