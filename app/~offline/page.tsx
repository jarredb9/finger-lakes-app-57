"use client";

import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
      <div className="mb-6 rounded-full bg-muted p-4">
        <WifiOff className="h-12 w-12 text-muted-foreground" />
      </div>
      <h1 className="mb-2 text-2xl font-bold tracking-tight">
        Connection Lost
      </h1>
      <p className="mb-6 max-w-md text-muted-foreground">
        We couldn&apos;t load this page because you&apos;re offline and it wasn&apos;t saved to your device.
        <br className="mb-2" />
        Check your internet connection or try navigating back to the home page to access your saved trips and wineries.
      </p>
      <div className="flex gap-4">
        <Button variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
        <Button asChild>
          <Link href="/">Go Home</Link>
        </Button>
      </div>
    </div>
  );
}