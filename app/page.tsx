import { redirect } from "next/navigation"
import { getUser } from "@/lib/auth"
import Header from "@/components/header"
import { AppShell } from "@/components/app-shell"

export default async function HomePage() {
  const user = await getUser()

  if (!user) {
    redirect("/login")
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <Header user={user} />
      <div className="flex-1 overflow-hidden relative">
        <AppShell user={user} />
      </div>
    </div>
  )
}