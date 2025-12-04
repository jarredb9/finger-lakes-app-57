"use client";

import { createContext, useContext, ReactNode } from "react";
import { useWineryMap } from "@/hooks/use-winery-map";
import { AuthenticatedUser } from "@/lib/types";

type WineryMapData = ReturnType<typeof useWineryMap>;

const WineryMapContext = createContext<WineryMapData | null>(null);

export function WineryMapProvider({ 
  children, 
  user 
}: { 
  children: ReactNode; 
  user: AuthenticatedUser; 
}) {
  const wineryMapData = useWineryMap(user.id);

  return (
    <WineryMapContext.Provider value={wineryMapData}>
      {children}
    </WineryMapContext.Provider>
  );
}

export function useWineryMapContext() {
  const context = useContext(WineryMapContext);
  if (!context) {
    throw new Error("useWineryMapContext must be used within a WineryMapProvider");
  }
  return context;
}
