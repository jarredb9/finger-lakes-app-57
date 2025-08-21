"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { Visit } from "@/lib/types"
import { DataTable } from "@/components/ui/data-table"
import { columns } from "@/components/visits-table-columns"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Star, ArrowUp, ArrowDown, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis
} from "@/components/ui/pagination"

const MobileVisitCard = ({ visit, onWinerySelect }: { visit: Visit; onWinerySelect: (visit: Visit) => void; }) => (
    <Card className="mb-4" onClick={() => onWinerySelect(visit)}>
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

const ITEMS_PER_PAGE = 10;

export default function VisitHistory({ onWinerySelect }: { onWinerySelect: (wineryDbId: number) => void; }) {
    const [visits, setVisits] = useState<Visit[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'date', direction: 'desc' });
    const [filter, setFilter] = useState("");

    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

    const fetchVisits = useCallback(async (page: number) => {
        setLoading(true);
        try {
            const response = await fetch(`/api/visits?page=${page}&limit=${ITEMS_PER_PAGE}`);
            if (response.ok) {
                const { visits, totalCount } = await response.json();
                setVisits(visits);
                setTotalCount(totalCount);
            }
        } catch (error) {
            console.error("Failed to fetch visit history", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchVisits(currentPage);
    }, [currentPage, fetchVisits]);

    const handlePageChange = (page: number) => {
        if (page > 0 && page <= totalPages) {
            setCurrentPage(page);
        }
    };

    const handleSort = (key: SortConfig['key']) => {
        setSortConfig(current => {
            if (current.key === key) {
                return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: key === 'name' ? 'asc' : 'desc' };
        });
    };
    
    const sortedAndFilteredVisitsForMobile = useMemo(() => {
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
    
    const clearFiltersAndSort = () => {
        setFilter("");
        setSortConfig({ key: 'date', direction: 'desc' });
    };
    
    const renderPagination = () => (
        <Pagination>
            <PaginationContent>
                <PaginationItem>
                    <PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); handlePageChange(currentPage - 1); }} />
                </PaginationItem>
                {[...Array(totalPages)].map((_, i) => (
                    <PaginationItem key={i}>
                        <PaginationLink href="#" onClick={(e) => { e.preventDefault(); handlePageChange(i + 1); }} isActive={currentPage === i + 1}>
                            {i + 1}
                        </PaginationLink>
                    </PaginationItem>
                ))}
                <PaginationItem>
                    <PaginationNext href="#" onClick={(e) => { e.preventDefault(); handlePageChange(currentPage + 1); }} />
                </PaginationItem>
            </PaginationContent>
        </Pagination>
    );

    if (loading && visits.length === 0) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-10 w-1/3" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    const SortIcon = ({ sortKey }: { sortKey: SortConfig['key'] }) => {
        if (sortConfig.key !== sortKey) return null;
        return sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4 ml-2" /> : <ArrowDown className="h-4 w-4 ml-2" />;
    };
    
    const showMobileClear = filter || !(sortConfig.key === 'date' && sortConfig.direction === 'desc');

    return (
        <div>
            <h1 className="text-2xl font-bold mb-4">Your Visit History</h1>
            <p className="text-muted-foreground mb-6">
                Here you can find all of your past winery visits. Click on a row to see more details.
            </p>
            
            {/* Mobile-only controls */}
            <div className="md:hidden space-y-4 mb-4">
                <Input
                    placeholder="Filter by winery or review..."
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                />
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">Sort by:</span>
                    <Button variant={sortConfig.key === 'date' ? 'secondary' : 'ghost'} onClick={() => handleSort('date')}>
                        Date <SortIcon sortKey="date" />
                    </Button>
                    <Button variant={sortConfig.key === 'name' ? 'secondary' : 'ghost'} onClick={() => handleSort('name')}>
                        Winery <SortIcon sortKey="name" />
                    </Button>
                    <Button variant={sortConfig.key === 'rating' ? 'secondary' : 'ghost'} onClick={() => handleSort('rating')}>
                        Rating <SortIcon sortKey="rating" />
                    </Button>
                     {showMobileClear && (
                        <Button variant="ghost" size="icon" onClick={clearFiltersAndSort}>
                            <XCircle className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Desktop View: Table */}
            <div className="hidden md:block">
                <DataTable columns={columns} data={visits} onRowClick={handleRowClick} />
                {totalPages > 1 && <div className="mt-4">{renderPagination()}</div>}
            </div>

            {/* Mobile View: Cards */}
            <div className="block md:hidden">
                {sortedAndFilteredVisitsForMobile.length > 0 ? (
                    sortedAndFilteredVisitsForMobile.map(visit => (
                        <MobileVisitCard key={visit.id} visit={visit} onWinerySelect={handleRowClick} />
                    ))
                ) : (
                     <p className="text-center text-muted-foreground py-12">No visits found.</p>
                )}
                {totalPages > 1 && <div className="mt-4">{renderPagination()}</div>}
            </div>
        </div>
    )
}