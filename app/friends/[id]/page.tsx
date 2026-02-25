"use client";

import { use } from "react";
import FriendProfile from "@/components/FriendProfile";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function FriendProfilePage({ params }: PageProps) {
  const { id } = use(params);

  return (
    <div className="container max-w-2xl mx-auto px-4 py-6 md:py-8 min-h-screen">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/friends">
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Go back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold">Friend Profile</h1>
      </div>
      
      <FriendProfile friendId={id} />
    </div>
  );
}
