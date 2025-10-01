
import { useEffect, useState, useMemo } from "react";
import { useTripStore } from "@/lib/stores/tripStore";
import { useWineryStore } from "@/lib/stores/wineryStore";
import TripCard from "./trip-card";
import { Button } from "./ui/button";
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

export default function TripList() {
  const { trips, isLoading, fetchAllTrips } = useTripStore();
  console.log("[TripList] trips from store:", trips);
  const { wineries } = useWineryStore();
  const [sortBy, setSortBy] = useState("trip_date");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetchAllTrips();
  }, [fetchAllTrips]);

  const filteredAndSortedTrips = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);

    const filtered = trips.filter(trip => {
      if (filter === "all") return true;
      if (filter === "upcoming") return trip.trip_date >= today;
      if (filter === "past") return trip.trip_date < today;
      return true;
    });

    return filtered.sort((a, b) => {
      let valA, valB;
      if (sortBy === 'name') {
        valA = a.name || '';
        valB = b.name || '';
      } else { // trip_date
        valA = new Date(a.trip_date).getTime();
        valB = new Date(b.trip_date).getTime();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [trips, filter, sortBy, sortOrder]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">My Trips</h2>
        <div className="flex items-center gap-2">
          <ToggleGroup type="single" value={filter} onValueChange={setFilter} defaultValue="all">
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="upcoming">Upcoming</ToggleGroupItem>
            <ToggleGroupItem value="past">Past</ToggleGroupItem>
          </ToggleGroup>
          <Select value={`${sortBy}-${sortOrder}`} onValueChange={(value) => {
            const [sort, order] = value.split('-');
            setSortBy(sort);
            setSortOrder(order);
          }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="trip_date-desc">Date (Newest First)</SelectItem>
              <SelectItem value="trip_date-asc">Date (Oldest First)</SelectItem>
              <SelectItem value="name-asc">Name (A-Z)</SelectItem>
              <SelectItem value="name-desc">Name (Z-A)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredAndSortedTrips.length > 0 ? (
        <div className="space-y-4">
          {filteredAndSortedTrips.map((trip) => (
            <TripCard key={trip.id} trip={trip} allWineries={wineries} />
          ))}
        </div>
      ) : (
        <p>{"You haven't created any trips yet."}</p>
      )}
    </div>
  );
}
