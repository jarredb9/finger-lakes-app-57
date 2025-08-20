// File Location: app/trips/trips-client-page.tsx

"use client";

import { useSearchParams, useRouter } from "next/navigation";
import TripPlanner from "@/components/trip-planner";
import TripList from "@/components/trip-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface TripsClientPageProps {
  user: { name: string } | null;
}

export default function TripsClientPage({ user }: TripsClientPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const dateFromQuery = searchParams.get('date');
  const initialTab = dateFromQuery ? 'planner' : 'all-trips';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Effect to sync the tab state if the URL query parameter changes
  useEffect(() => {
      if (dateFromQuery) {
          setActiveTab('planner');
      }
  }, [dateFromQuery]);

  const handleTabChange = (value: string) => {
      setActiveTab(value);
      // When switching tabs, we update the URL to reflect the state without the date param
      // to avoid confusion.
      if (value !== 'planner') {
        router.push('/trips');
      }
  };

  if (!user) {
    // This should ideally not be reached if the server component handles redirection,
    // but it's a good safeguard.
    return (
        <div className="min-h-screen flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
        </div>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto">
            <TabsTrigger value="planner">Planner</TabsTrigger>
            <TabsTrigger value="all-trips">All Trips</TabsTrigger>
        </TabsList>
        <TabsContent value="planner" className="mt-6">
            <TripPlanner initialDate={dateFromQuery ? new Date(dateFromQuery) : new Date()} />
        </TabsContent>
        <TabsContent value="all-trips" className="mt-6">
            <TripList />
        </TabsContent>
    </Tabs>
  );
}