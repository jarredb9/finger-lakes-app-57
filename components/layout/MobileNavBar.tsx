export type NavTab = "explore" | "trips" | "friends" | "history";

export interface MobileNavBarProps {
  activeTab: NavTab;
  isMobileSheetOpen: boolean;
  onTabSelect: (tab: NavTab) => void;
  onMapSelect: () => void;
  className?: string;
}

export function MobileNavBar(_props: MobileNavBarProps) {
  return null;
}
