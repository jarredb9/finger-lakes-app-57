import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getUser } from "@/lib/auth";
import FriendProfile from "@/components/FriendProfile";
import { AuthenticatedModalHost } from "@/components/modals/authenticated-modal-host";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Friend Profile | Finger Lakes Winery Planner",
  description: "View friend profile and activity",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function FriendProfilePage({ params }: PageProps) {
  const { id } = await params;
  const user = await getUser();

  if (!user) {
    redirect(`/login?redirectTo=/friends/${id}`);
  }

  return (
    <div className="container max-w-2xl mx-auto px-4 py-6 md:py-8 min-h-screen">
      <AuthenticatedModalHost />
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
