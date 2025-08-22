"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Map, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

export default function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Map", icon: Map },
    { href: "/trips", label: "Trips", icon: CalendarDays },
  ];

  return (
    // NOTE: Added a temporary red border for debugging. We can remove it once it's working.
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur-sm border-t border-t-4 border-red-500">
      <div className="grid grid-cols-2 h-16">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href) && (item.href !== '/' || pathname === '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-sm font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-primary"
              )}
            >
              <item.icon className="h-6 w-6" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}