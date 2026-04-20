"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

export function useMounted() {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  return mounted;
}
