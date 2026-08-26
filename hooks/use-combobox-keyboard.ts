import { useState, useRef, RefObject, KeyboardEvent, Dispatch, SetStateAction } from "react";

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

export function useComboboxKeyboard<T>(_options: UseComboboxKeyboardOptions<T>): UseComboboxKeyboardReturn {
  const [activeIndex, setActiveIndex] = useState(-1);
  const internalRef = useRef<HTMLElement | null>(null);

  const handleKeyDown = (_e: KeyboardEvent<HTMLElement>) => {};

  return {
    activeIndex,
    setActiveIndex,
    handleKeyDown,
    containerRef: internalRef,
  };
}
