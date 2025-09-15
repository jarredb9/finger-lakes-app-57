'use client'

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import TripList from "@/components/trip-list"
import TripPlanner from "@/components/trip-planner"
import VisitHistory from "@/components/visit-history"
import { User } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"

function TripsView() {
  const [tripType, setTripType] = useState<'upcoming' | 'past'>('upcoming');

  return (
    <div>
      <div className="flex space-x-2 mb-4">
        <Button
          variant={tripType === 'upcoming' ? 'secondary' : 'ghost'}
          onClick={() => setTripType('upcoming')}
        >
          Upcoming
        </Button>
        <Button
          variant={tripType === 'past' ? 'secondary' : 'ghost'}
          onClick={() => setTripType('past')}
        >
          Past
        </Button>
      </div>
      <TripList type={tripType} />
    </div>
  )
}

export default function TripsClientPage({ user }: { user: User }) {

  const handleWinerySelect = (wineryDbId: number) => {
    // This function will need to be implemented to show the winery details.
    // For now, it will just log the ID.
    console.log("Winery selected:", wineryDbId)
  }

  return (
    <Tabs defaultValue="trips">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="trips">My Trips</TabsTrigger>
        <TabsTrigger value="planner">Plan a Trip</TabsTrigger>
        <TabsTrigger value="history">Visit History</TabsTrigger>
      </TabsList>
      <TabsContent value="trips">
        <TripsView />
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
