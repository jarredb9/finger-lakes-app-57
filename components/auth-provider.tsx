"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { createClient } from "@/utils/supabase/client"
import type { User } from "@supabase/supabase-js"
import { Loader2 } from "lucide-react"

type AuthContextType = {
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    // Also check for the initial session
    const getInitialSession = async () => {
        const { data } = await supabase.auth.getSession();
        setUser(data.session?.user ?? null);
        setLoading(false);
    }
    getInitialSession();

    return () => {
      subscription?.unsubscribe()
    }
  }, [supabase.auth])

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}