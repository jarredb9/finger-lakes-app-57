"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Link from "next/link"

export default function ManualConfirmPage() {
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    if (!email) {
      setMessage("Please enter your email address")
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/auth/confirm-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      if (response.ok) {
        setMessage("Account confirmed! You can now sign in.")
      } else {
        const { message } = await response.json();
        setMessage(message || "Could not confirm account. The user may not exist or may already be confirmed.")
      }
    } catch (err) {
      setMessage("An error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Manual Account Confirmation</CardTitle>
          <CardDescription>
            {"If your account needs email confirmation but you haven't received an email, try this manual confirmation."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {message && (
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button onClick={handleConfirm} disabled={loading} className="w-full">
            {loading ? "Confirming..." : "Confirm Account"}
          </Button>
          <div className="text-center">
            <Link href="/login" className="text-blue-600 hover:underline text-sm">
              Back to Sign In
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}