"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Info, AlertTriangle } from "lucide-react"

export default function SignupForm() {
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [userEmail, setUserEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const router = useRouter()

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError("")
    setSuccess("")
    setNeedsConfirmation(false)

    const name = formData.get("name") as string
    const email = formData.get("email") as string
    const password = formData.get("password") as string
    const confirmPassword = formData.get("confirmPassword") as string

    if (!name || !email || !password || !confirmPassword) {
      setError("Please fill in all fields")
      setLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long")
      setLoading(false)
      return
    }

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      })

      const data = await response.json()

      if (response.ok) {
        if (data.needsConfirmation) {
          setNeedsConfirmation(true)
          setUserEmail(email)
          setSuccess(data.message || "Account created but needs email confirmation.")
        } else if (data.userExists) {
          setSuccess(data.message)
        } else {
          router.push("/")
          router.refresh()
        }
      } else {
        setError(data.error || "Signup failed")
      }
    } catch (err) {
      console.error("Signup error:", err)
      setError("An error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  async function handleManualConfirm() {
    setConfirming(true)
    try {
      const response = await fetch("/api/auth/confirm-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      })

      const data = await response.json()

      if (response.ok) {
        setSuccess("Account confirmed! You can now sign in.")
        setNeedsConfirmation(false)
      } else {
        setError("Could not confirm account automatically. Please try signing in anyway.")
      }
    } catch (err) {
      setError("Confirmation failed. Please try signing in anyway.")
    } finally {
      setConfirming(false)
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Create Account</CardTitle>
        <CardDescription>Sign up to start tracking your winery visits</CardDescription>
      </CardHeader>
      <form action={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert className="border-blue-200 bg-blue-50">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                {success}
                {needsConfirmation && (
                  <div className="mt-3 space-y-2">
                    <Button
                      type="button"
                      onClick={handleManualConfirm}
                      disabled={confirming}
                      size="sm"
                      className="mr-2"
                    >
                      {confirming ? "Confirming..." : "Try Manual Confirmation"}
                    </Button>
                    <Link href="/login" className="text-blue-600 hover:underline font-medium">
                      Or try signing in →
                    </Link>
                  </div>
                )}
                {success.includes("exists") && (
                  <div className="mt-2">
                    <Link href="/login" className="text-blue-600 hover:underline font-medium">
                      Go to sign in →
                    </Link>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input id="name" name="name" type="text" placeholder="John Doe" required autoComplete="name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="your@email.com" required autoComplete="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" minLength={6} required autoComplete="new-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              minLength={6}
              required
              autoComplete="new-password"
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </Button>
          <p className="text-sm text-center text-gray-600">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-600 hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
