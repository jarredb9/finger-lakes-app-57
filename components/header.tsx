"use client"

import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/components/auth-provider";

export default function Header() {
  const { user, loading } = useAuth();
  
  const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || "User";

  return (
    <header className="border-b bg-white/80 backdrop-blur-lg sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
              <Image src="/placeholder-logo.png" alt="Winery Tracker Logo" width={32} height={32} />
              <h1 className="text-xl font-bold text-gray-900 ml-3">Winery Tracker</h1>
            </Link>
          </div>
          <nav className="flex items-center space-x-8">
            <Link href="/" className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors">
                Map
            </Link>
            <Link href="/trips" className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors">
                Trips
            </Link>
          </nav>
          <div className="flex items-center space-x-4">
            {loading ? (
              <div className="h-5 w-24 bg-gray-200 rounded-md animate-pulse" />
            ) : user ? (
              <>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-800">Welcome, {userName}</p>
                </div>
                <Link href="/logout" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
                  Logout
                </Link>
              </>
            ) : (
               <Link href="/login" className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors">
                  Login
                </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}