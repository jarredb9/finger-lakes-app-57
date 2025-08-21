"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Visit } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ArrowUpDown } from "lucide-react"
import { Star } from "lucide-react"

export const columns: ColumnDef<Visit>[] = [
  {
    accessorKey: "winery_name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Winery
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
        const name = row.original.wineries?.name;
        // The 'before' content is for the mobile card label
        return <div className="font-medium before:content-['Winery:'] before:font-normal before:text-muted-foreground md:before:content-none">{name}</div>
    },
    filterFn: (row, id, value) => {
        const review = row.original.user_review || "";
        const name = row.original.wineries?.name || "";
        return name.toLowerCase().includes(value.toLowerCase()) || review.toLowerCase().includes(value.toLowerCase());
    }
  },
  {
    accessorKey: "visit_date",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
        const date = new Date(row.original.visit_date + 'T00:00:00').toLocaleDateString();
        return <div className="before:content-['Date:'] before:font-normal before:text-muted-foreground md:before:content-none">{date}</div>
    }
  },
  {
    accessorKey: "rating",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Rating
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
        const rating = row.original.rating;
        if (!rating) return <div className="text-muted-foreground before:content-['Rating:'] before:font-normal md:before:content-none">Unrated</div>

        return (
            <div className="flex items-center gap-x-2 before:content-['Rating:'] before:font-normal before:text-muted-foreground md:before:content-none">
                <div className="flex">
                    {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-4 h-4 ${i < rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} />
                    ))}
                </div>
            </div>
        )
    }
  },
  {
    accessorKey: "user_review",
    header: "Review",
    cell: ({ row }) => {
        const review = row.original.user_review;
        return <div className="text-sm text-muted-foreground truncate max-w-xs md:before:content-none before:content-['Review:'] before:font-normal before:text-muted-foreground">{review || "No review."}</div>
    }
  },
]