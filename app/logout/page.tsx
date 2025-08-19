"use client"

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    const performLogout = async () => {
      try {
        // Call the logout API endpoint
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (error) {
        console.error("Logout failed", error);
      } finally {
        // Redirect to the login page regardless of API call success
        router.push('/login');
        // Refresh the router cache to ensure all user data is cleared
        router.refresh();
      }
    };

    performLogout();
  }, [router]);

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