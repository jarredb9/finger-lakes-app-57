"use client";

import { useSearchParams, useRouter } from "next/navigation";
import TripPlanner from "@/components/trip-planner";
import TripList from "@/components/trip-list";
import VisitHistory from "@/components/visit-history"; // Import the new component
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

  useEffect(() => {
      if (dateFromQuery) {
          setActiveTab('planner');
      }
  }, [dateFromQuery]);

  const handleTabChange = (value: string) => {
      setActiveTab(value);
      if (value !== 'planner') {
        router.push('/trips');
      }
  };

  if (!user) {
    return (
        <div className="min-h-screen flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
        </div>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-lg mx-auto">
            <TabsTrigger value="planner">Planner</TabsTrigger>
            <TabsTrigger value="all-trips">All Trips</TabsTrigger>
            <TabsTrigger value="visit-history">Visit History</TabsTrigger>
        </TabsList>
        <TabsContent value="planner" className="mt-6">
            <TripPlanner initialDate={dateFromQuery ? new Date(dateFromQuery) : new Date()} />
        </TabsContent>
        <TabsContent value="all-trips" className="mt-6">
            <TripList />
        </TabsContent>
        <TabsContent value="visit-history" className="mt-6">
            <VisitHistory />
        </TabsContent>
    </Tabs>
  );
}