"use client"

import { ColumnDef } from '@tanstack/react-table';
import { VisitWithWinery } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Star, ArrowUpDown, Lock } from 'lucide-react';

export const columns: ColumnDef<VisitWithWinery>[] = [
  {
    accessorKey: 'wineries.name', 
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Winery
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    sortingFn: (rowA, rowB) => {
      const nameA = rowA.original.wineries?.name || '';
      const nameB = rowB.original.wineries?.name || '';
      return nameA.localeCompare(nameB);
    },
    cell: ({ row }) => {
        const name = row.original.wineries?.name;
        return <div className="font-medium">{name}</div>;
    },
  },
  {
    accessorKey: 'visit_date',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    sortingFn: (rowA, rowB) => {
      const timeA = new Date(rowA.original.visit_date).getTime();
      const timeB = new Date(rowB.original.visit_date).getTime();
      return timeA - timeB;
    },
    cell: ({ row }) => {
        const isPrivate = row.original.is_private;
        return (
            <div className="flex items-center gap-1.5">
                {new Date(row.original.visit_date + 'T00:00:00').toLocaleDateString()}
                {isPrivate && <Lock className="h-3 w-3 text-muted-foreground" />}
            </div>
        );
    }
  },
  {
    accessorKey: 'rating',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Rating
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    sortingFn: (rowA, rowB) => {
      const ratingA = rowA.original.rating ?? 0;
      const ratingB = rowB.original.rating ?? 0;
      return ratingA - ratingB;
    },
    cell: ({ row }) => {
        const rating = row.original.rating;
        if (!rating) return <div className="text-muted-foreground">Unrated</div>;

        return (
            <div className="flex items-center">
                {[...Array(5)].map((_, i) => (
                    <Star key={i} className={`w-4 h-4 ${i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
                ))}
            </div>
        );
    }
  },
  {
    accessorKey: 'user_review',
    header: () => <div className="hidden md:block">Visit Note</div>,
    cell: ({ row }) => {
        const review = row.original.user_review;
        return <div className="text-sm text-muted-foreground truncate max-w-xs hidden md:block">{review || 'No notes.'}</div>;
    }
  },
];