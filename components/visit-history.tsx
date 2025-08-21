"use client"

import { useEffect, useState, useMemo } from "react"
import { Visit } from "@/lib/types"
import { DataTable } from "@/components/ui/data-table"
import { columns } from "@/components/visits-table-columns"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Star } from "lucide-react"

// A new component for the mobile card view
const MobileVisitCard = ({ visit, onWinerySelect }: { visit: Visit; onWinerySelect: (wineryDbId: number) => void; }) => (
    <Card className="mb-4" onClick={() => onWinerySelect(visit.wineries!.id)}>
        <CardHeader>
            <CardTitle>{visit.wineries?.name}</CardTitle>
            <CardDescription>{new Date(visit.visit_date + 'T00:00:00').toLocaleDateString()}</CardDescription>
        </CardHeader>
        <CardContent>
            {visit.rating && (
                <div className="flex items-center mb-2">
                    {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-5 h-5 ${i < visit.rating! ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} />
                    ))}
                </div>
            )}
            <p className="text-sm text-muted-foreground">{visit.user_review || "No review."}</p>
        </CardContent>
    </Card>
);

export default function VisitHistory({ onWinerySelect }: { onWinerySelect: (wineryDbId: number) => void; }) {
    const [visits, setVisits] = useState<Visit[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortOption, setSortOption] = useState("date-desc");
    const [filter, setFilter] = useState("");

    useEffect(() => {
        async function fetchVisits() {
            try {
                const response = await fetch('/api/visits');
                if (response.ok) {
                    const data = await response.json();
                    setVisits(data);
                }
            } catch (error) {
                console.error("Failed to fetch visit history", error);
            } finally {
                setLoading(false);
            }
        }
        fetchVisits();
    }, []);

    const sortedAndFilteredVisits = useMemo(() => {
        let filtered = visits.filter(visit => {
            const name = visit.wineries?.name?.toLowerCase() || "";
            const review = visit.user_review?.toLowerCase() || "";
            const searchTerm = filter.toLowerCase();
            return name.includes(searchTerm) || review.includes(searchTerm);
        });

        return filtered.sort((a, b) => {
            switch (sortOption) {
                case "date-asc":
                    return new Date(a.visit_date).getTime() - new Date(b.visit_date).getTime();
                case "name-asc":
                    return (a.wineries?.name || "").localeCompare(b.wineries?.name || "");
                case "rating-desc":
                    return (b.rating || 0) - (a.rating || 0);
                case "date-desc":
                default:
                    return new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime();
            }
        });
    }, [visits, sortOption, filter]);

    const handleRowClick = (visit: Visit) => {
        if (visit.wineries?.id) {
            onWinerySelect(visit.wineries.id);
        }
    };

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-10 w-1/3" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    return (
        <div>
            <h1 className="text-2xl font-bold mb-4">Your Visit History</h1>
            <p className="text-muted-foreground mb-6">
                Here you can find all of your past winery visits. Use the search bar to filter, or the dropdown to sort your history.
            </p>
            
            <div className="flex flex-col md:flex-row gap-4 mb-4">
                <Input
                    placeholder="Filter by winery or review..."
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    className="max-w-sm"
                />
                 <Select value={sortOption} onValueChange={setSortOption}>
                    <SelectTrigger className="w-full md:w-[280px]">
                        <SelectValue placeholder="Sort by..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="date-desc">Date (Newest First)</SelectItem>
                        <SelectItem value="date-asc">Date (Oldest First)</SelectItem>
                        <SelectItem value="name-asc">Winery Name (A-Z)</SelectItem>
                        <SelectItem value="rating-desc">Rating (High to Low)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Desktop View: Table */}
            <div className="hidden md:block">
                <DataTable columns={columns} data={sortedAndFilteredVisits} onRowClick={handleRowClick} />
            </div>

            {/* Mobile View: Cards */}
            <div className="block md:hidden">
                {sortedAndFilteredVisits.length > 0 ? (
                    sortedAndFilteredVisits.map(visit => (
                        <MobileVisitCard key={visit.id} visit={visit} onWinerySelect={handleRowClick} />
                    ))
                ) : (
                     <p className="text-center text-muted-foreground py-12">No visits found.</p>
                )}
            </div>
        </div>
    )
}