"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2 } from "lucide-react"
import { useActionState } from "react" // Import useActionState
import { login } from "@/app/actions" // Import the login server action

export default function LoginForm() {
  const router = useRouter()

  const [state, formAction, isPending] = useActionState(
    async (_prevState: { success: boolean; message: string; }, formData: FormData) => {
      const email = formData.get("email") as string
      const password = formData.get("password") as string

      if (!email || !password) {
        return { success: false, message: "Please enter both email and password" }
      }

      const result = await login(email, password)
      if (result.success) {
        router.push("/")
        router.refresh()
      }
      return result // { success: boolean, message: string }
    },
    { success: true, message: "" } // Initial state
  );

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle><h1 className="text-2xl font-bold">Sign In</h1></CardTitle>
        <CardDescription>Enter your credentials to access your account</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          {!state.success && state.message && (
            <Alert variant="destructive">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="your@email.com" required autoComplete="email" aria-label="Email Address" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/forgot-password" className="text-sm text-blue-700 hover:underline font-medium">
                Forgot password?
              </Link>
            </div>
            <Input id="password" name="password" type="password" required autoComplete="current-password" aria-label="Password" />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={isPending} aria-label="Sign In">
            {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...</> : "Sign In"}
          </Button>
          <p className="text-sm text-center text-gray-700 font-medium">
            {"Don't have an account? "}
            <Link href="/signup" className="text-blue-700 hover:underline underline-offset-4">
              Sign up
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}