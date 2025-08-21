"use client"

import { useEffect, useState, useMemo } from "react"
import { Visit } from "@/lib/types"
import { DataTable } from "@/components/ui/data-table"
import { columns } from "@/components/visits-table-columns"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Star, ArrowUp, ArrowDown } from "lucide-react"
import { Button } from "@/components/ui/button"

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

type SortConfig = {
    key: 'date' | 'name' | 'rating';
    direction: 'asc' | 'desc';
};

export default function VisitHistory({ onWinerySelect }: { onWinerySelect: (wineryDbId: number) => void; }) {
    const [visits, setVisits] = useState<Visit[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'date', direction: 'desc' });
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

    const handleSort = (key: SortConfig['key']) => {
        setSortConfig(current => {
            if (current.key === key) {
                return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: key === 'name' ? 'asc' : 'desc' };
        });
    };
    
    const sortedAndFilteredVisits = useMemo(() => {
        let filtered = visits.filter(visit => {
            const name = visit.wineries?.name?.toLowerCase() || "";
            const review = visit.user_review?.toLowerCase() || "";
            const searchTerm = filter.toLowerCase();
            return name.includes(searchTerm) || review.includes(searchTerm);
        });

        return [...filtered].sort((a, b) => {
            if (sortConfig.key === 'date') {
                const dateA = new Date(a.visit_date).getTime();
                const dateB = new Date(b.visit_date).getTime();
                return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
            }
            if (sortConfig.key === 'name') {
                const nameA = a.wineries?.name || "";
                const nameB = b.wineries?.name || "";
                return sortConfig.direction === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
            }
            if (sortConfig.key === 'rating') {
                const ratingA = a.rating || 0;
                const ratingB = b.rating || 0;
                return sortConfig.direction === 'asc' ? ratingA - ratingB : ratingB - ratingA;
            }
            return 0;
        });
    }, [visits, sortConfig, filter]);

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

    const SortIcon = ({ sortKey }: { sortKey: SortConfig['key'] }) => {
        if (sortConfig.key !== sortKey) return null;
        return sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
    };

    return (
        <div>
            <h1 className="text-2xl font-bold mb-4">Your Visit History</h1>
            <p className="text-muted-foreground mb-6">
                Here you can find all of your past winery visits. Click on a row to see more details.
            </p>
            
            <div className="flex flex-col md:flex-row gap-4 mb-4">
                <Input
                    placeholder="Filter by winery or review..."
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    className="max-w-sm"
                />
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Sort by:</span>
                    <Button variant={sortConfig.key === 'date' ? 'secondary' : 'ghost'} onClick={() => handleSort('date')}>
                        Date <SortIcon sortKey="date" />
                    </Button>
                    <Button variant={sortConfig.key === 'name' ? 'secondary' : 'ghost'} onClick={() => handleSort('name')}>
                        Winery Name <SortIcon sortKey="name" />
                    </Button>
                    <Button variant={sortConfig.key === 'rating' ? 'secondary' : 'ghost'} onClick={() => handleSort('rating')}>
                        Rating <SortIcon sortKey="rating" />
                    </Button>
                </div>
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