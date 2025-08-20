"use client";

import { useSearchParams, useRouter } from "next/navigation";
import TripPlanner from "@/components/trip-planner";
import TripList from "@/components/trip-list";
import Header from "@/components/header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useState } from "react";

// A simple custom hook to get user data on the client side.
const useClientUser = () => {
    const [user, setUser] = useState<{ name: string } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await fetch('/api/auth/user'); 
                if (res.ok) {
                    const data = await res.json();
                    setUser(data);
                } else {
                    // If unauthorized, redirect to login
                    window.location.href = '/login';
                }
            } catch (error) {
                console.error("Failed to fetch user:", error);
                window.location.href = '/login';
            } finally {
                setLoading(false);
            }
        };
        fetchUser();
    }, []);

    return { user, loading };
};

export default function TripsPage() {
  const { user, loading } = useClientUser();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const dateFromQuery = searchParams.get('date');
  // Default to 'planner' if a date is in the URL, otherwise 'all-trips'
  const initialTab = dateFromQuery ? 'planner' : 'all-trips';
  const [activeTab, setActiveTab] = useState(initialTab);

  // This effect ensures that if the user navigates with a date query param,
  // the planner tab becomes active.
  useEffect(() => {
      if (dateFromQuery) {
          setActiveTab('planner');
      }
  }, [dateFromQuery]);

  const handleTabChange = (value: string) => {
      setActiveTab(value);
      // Clear the date from URL when switching away from the planner to avoid confusion
      if (value !== 'planner') {
        router.push('/trips');
      }
  };

  if (loading) {
    return (
        <div className="min-h-screen flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
        </div>
    );
  }
  
  // If not loading and no user, the hook will have redirected.
  // This is a safeguard.
  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
      </main>
    </div>
  );
}