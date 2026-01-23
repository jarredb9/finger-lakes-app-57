import { createClient } from "@/utils/supabase/server"
import { DebugClientTools } from "@/components/debug-client-tools"

export default async function DebugPage() {
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  // Try to list users (admin function)
  let users = null
  let usersError: any = null
  try {
    const { data, error } = await supabase.auth.admin.listUsers()
    users = data?.users
    usersError = error
  } catch (e: any) {
    usersError = e
  }

  // Check visits table
  const { data: visits, error: visitsError } = await supabase.from("visits").select("*")

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-center">Debug Information</h1>

        {/* Client Tools */}
        <DebugClientTools />

        {/* Current User */}
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Current User</h2>
          {user ? (
            <div className="space-y-2">
              <p>
                <strong>ID:</strong> {user.id}
              </p>
              <p>
                <strong>Email:</strong> {user.email}
              </p>
              <p>
                <strong>Name:</strong> {user.user_metadata?.name || "Not set"}
              </p>
              <p>
                <strong>Email Confirmed:</strong> {user.email_confirmed_at ? "Yes" : "No"}
              </p>
              <p>
                <strong>Created:</strong> {user.created_at}
              </p>
            </div>
          ) : (
            <p className="text-gray-500">No user logged in</p>
          )}
          {userError && <div className="mt-2 p-2 bg-red-100 text-red-700 rounded">Error: {userError.message}</div>}
        </div>

        {/* All Users */}
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold mb-4">All Users (Admin View)</h2>
          {users ? (
            <div className="space-y-4">
              {users.map((u: any) => (
                <div key={u.id} className="border p-3 rounded">
                  <p>
                    <strong>Email:</strong> {u.email}
                  </p>
                  <p>
                    <strong>Confirmed:</strong> {u.email_confirmed_at ? "Yes" : "No"}
                  </p>
                  <p>
                    <strong>Name:</strong> {u.user_metadata?.name || "Not set"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No users found or admin access not available</p>
          )}
          {usersError && <div className="mt-2 p-2 bg-red-100 text-red-700 rounded">Error: {usersError.message}</div>}
        </div>

        {/* Visits */}
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Visits Table</h2>
          {visits ? (
            <div>
              <p>Found {visits.length} visits</p>
              {visits.map((visit: any) => (
                <div key={visit.id} className="border p-3 rounded mt-2">
                  <p>
                    <strong>Winery:</strong> {visit.winery_name}
                  </p>
                  <p>
                    <strong>Date:</strong> {visit.visit_date}
                  </p>
                  <p>
                    <strong>User ID:</strong> {visit.user_id}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No visits found</p>
          )}
          {visitsError && <div className="mt-2 p-2 bg-red-100 text-red-700 rounded">Error: {visitsError.message}</div>}
        </div>
      </div>
    </div>
  )
}
