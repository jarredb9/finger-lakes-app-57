'use client';

import { useUserStore } from '@/lib/stores/userStore';
import Link from 'next/link';

export default function TestAuthPage() {
  const { user, isAuthenticated, isLoading, logout } = useUserStore();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Zustand Auth Test</h2>
          <div className="mt-4 p-4 bg-white rounded-lg shadow-sm">
            <h3 className="font-semibold mb-2">Current User State:</h3>
            {isLoading ? (
              <p>Loading...</p>
            ) : isAuthenticated ? (
              <div className="text-left">
                <p>
                  <strong>ID:</strong> {user?.id}
                </p>
                <p>
                  <strong>Email:</strong> {user?.email}
                </p>
                <p>
                  <strong>Name:</strong> {user?.name || 'Not set'}
                </p>
              </div>
            ) : (
              <p className="text-gray-500">No user logged in</p>
            )}
          </div>
          <div className="mt-4">
            {isAuthenticated ? (
              <button
                onClick={logout}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-xs text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Log Out
              </button>
            ) : (
              <Link
                href="/login"
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-xs text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Go to Login
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}