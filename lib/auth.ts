import { createClient } from "@/utils/supabase/server"

export async function getUser() {
  const supabase = await createClient()

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return null
    }

    return {
      id: user.id,
      name: user.user_metadata?.name || user.email?.split("@")[0] || "User",
      email: user.email || "",
    }
  } catch (error) {
    return null
  }
}