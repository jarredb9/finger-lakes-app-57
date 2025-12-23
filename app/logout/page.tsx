"use client"

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useUserStore } from "@/lib/stores/userStore";

export default function LogoutPage() {
  const router = useRouter();
  const logout = useUserStore(state => state.logout);

  useEffect(() => {
    const performLogout = async () => {
      try {
        await logout();
      } catch (error) {
        console.error("Logout failed", error);
      } finally {
        router.push('/login');
        router.refresh();
      }
    };

    performLogout();
  }, [router, logout]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <h2 className="text-2xl font-bold">Logging you out...</h2>
        <p className="text-gray-600">You will be redirected shortly.</p>
      </div>
    </div>
  );
}