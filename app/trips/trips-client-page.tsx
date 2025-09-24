'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import TripList from "@/components/trip-list"
import TripPlanner from "@/components/trip-planner"
import VisitHistory from "@/components/visit-history"
import { User } from "@supabase/supabase-js"

export default function TripsClientPage({ user }: { user: User }) {

  const handleWinerySelect = (wineryDbId: number) => {
    
  }

  return (
    <Tabs defaultValue="trips">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="trips">My Trips</TabsTrigger>
        <TabsTrigger value="planner">Plan a Trip</TabsTrigger>
        <TabsTrigger value="history">Visit History</TabsTrigger>
      </TabsList>
      <TabsContent value="trips">
        <TripList />
      </TabsContent>
      <TabsContent value="planner">
        <TripPlanner initialDate={new Date()} user={user} />
      </TabsContent>
      <TabsContent value="history">
        <VisitHistory onWinerySelect={handleWinerySelect} />
      </TabsContent>
    </Tabs>
  )
}
