import {
  useState,
  useEffect,
  useRef,
  RefObject,
  KeyboardEvent,
  Dispatch,
  SetStateAction,
} from "react";

export interface UseComboboxKeyboardOptions<T> {
  items: T[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: T) => void;
  containerRef?: RefObject<HTMLElement | null>;
}

export interface UseComboboxKeyboardReturn {
  activeIndex: number;
  setActiveIndex: Dispatch<SetStateAction<number>>;
  handleKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  containerRef: RefObject<HTMLElement | null>;
}

export function useComboboxKeyboard<T>({
  items,
  isOpen,
  onOpenChange,
  onSelect,
  containerRef: externalContainerRef,
}: UseComboboxKeyboardOptions<T>): UseComboboxKeyboardReturn {
  const [rawActiveIndex, setRawActiveIndex] = useState<number>(-1);
  const internalContainerRef = useRef<HTMLElement | null>(null);
  const activeContainerRef = externalContainerRef || internalContainerRef;

  // Derive activeIndex purely based on open state and items availability
  const activeIndex = isOpen && items.length > 0 ? rawActiveIndex : -1;

  // Click outside listener to close dropdown
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        activeContainerRef.current &&
        !activeContainerRef.current.contains(event.target as Node)
      ) {
        onOpenChange(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onOpenChange, activeContainerRef]);

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!isOpen || items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setRawActiveIndex((prev) =>
        prev < items.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setRawActiveIndex((prev) =>
        prev > 0 ? prev - 1 : items.length - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rawActiveIndex >= 0 && rawActiveIndex < items.length) {
        onSelect(items[rawActiveIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
    }
  };

  return {
    activeIndex,
    setActiveIndex: setRawActiveIndex,
    handleKeyDown,
    containerRef: activeContainerRef,
  };
}
