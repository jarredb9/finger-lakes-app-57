import { createClient } from "@/utils/supabase/server"

export default async function TestAuthPage() {
  const supabase = await createClient()

  // Test the connection
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Supabase Auth Test</h2>
          <div className="mt-4 p-4 bg-white rounded-lg shadow">
            <h3 className="font-semibold mb-2">Current User:</h3>
            {user ? (
              <div className="text-left">
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
                  <strong>Confirmed:</strong> {user.email_confirmed_at ? "Yes" : "No"}
                </p>
              </div>
            ) : (
              <p className="text-gray-500">No user logged in</p>
            )}
            {error && <div className="mt-2 p-2 bg-red-100 text-red-700 rounded">Error: {error.message}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
