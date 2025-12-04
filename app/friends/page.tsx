import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { AuthenticatedUser } from "@/lib/types";

export default async function FriendsPage() {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
        <div className="flex-1 overflow-hidden relative">
            <AppShell user={user as AuthenticatedUser} initialTab="friends" />
        </div>
    </div>
  );
}
