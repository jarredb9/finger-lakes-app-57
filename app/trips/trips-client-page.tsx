"use client";

import { useSearchParams, useRouter } from "next/navigation";
import TripPlanner from "@/components/trip-planner";
import TripList from "@/components/trip-list";
import VisitHistory from "@/components/visit-history";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { Winery } from "@/lib/types";
import { useWineryData } from "@/hooks/use-winery-data";
import { useToast } from "@/hooks/use-toast";
import dynamic from "next/dynamic";

const WineryModal = dynamic(() => import('@/components/winery-modal'), {
  loading: () => <div className="fixed inset-0 bg-black/50 flex items-center justify-center"><Loader2 className="h-8 w-8 text-white animate-spin" /></div>,
});

interface TripsClientPageProps {
  user: { name: string } | null;
}

export default function TripsClientPage({ user }: TripsClientPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const dateFromQuery = searchParams.get('date');
  const initialTab = dateFromQuery ? 'planner' : 'visit-history'; // Default to visit history now
  const [activeTab, setActiveTab] = useState(initialTab);
  
  const [selectedWinery, setSelectedWinery] = useState<Winery | null>(null);
  const { allPersistentWineries, refreshAllData } = useWineryData();
  const { toast } = useToast();

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

  const handleWinerySelect = useCallback((wineryDbId: number) => {
    const wineryData = allPersistentWineries.find(w => w.dbId === wineryDbId);
    if (wineryData) {
        setSelectedWinery(wineryData);
    }
  }, [allPersistentWineries]);

  const handleUpdateVisit = async (visitId: string, visitData: { visit_date: string; user_review: string; rating: number; }) => {
    const response = await fetch(`/api/visits/${visitId}`, { 
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(visitData) 
    });
    if (response.ok) { 
        toast({ description: "Visit updated successfully." }); 
        await refreshAllData();
        setSelectedWinery(null); 
    } else { 
        toast({ variant: "destructive", description: "Failed to update visit." }); 
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
    <>
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
                <VisitHistory onWinerySelect={handleWinerySelect} />
            </TabsContent>
        </Tabs>

        {selectedWinery && (
            <WineryModal 
                winery={selectedWinery} 
                onClose={() => setSelectedWinery(null)} 
                onSaveVisit={async () => { /* Not needed here */ }}
                onUpdateVisit={handleUpdateVisit}
                onDeleteVisit={async () => { /* Can be implemented if needed */}}
                onToggleWishlist={async () => { /* Can be implemented if needed */}}
                onToggleFavorite={async () => { /* Can be implemented if needed */}}
            />
        )}
    </>
  );
}