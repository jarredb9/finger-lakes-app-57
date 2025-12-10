"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { CookieIcon } from "lucide-react"

export function CookieConsent() {
  const [showConsent, setShowConsent] = useState(false)

  useEffect(() => {
    // Check if user has already consented
    const hasConsented = localStorage.getItem("cookie-consent")
    if (!hasConsented) {
      setShowConsent(true)
    }
  }, [])

  const acceptCookies = () => {
    localStorage.setItem("cookie-consent", "true")
    setShowConsent(false)
  }

  if (!showConsent) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <Card className="shadow-lg border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CookieIcon className="h-4 w-4 text-primary" />
            Cookie Notice
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-2">
          <CardDescription>
            We use strictly necessary cookies to manage your login session and ensure the site functions correctly. 
            By using our site, you agree to our use of these cookies.
          </CardDescription>
        </CardContent>
        <CardFooter className="justify-end pt-2">
          <Button size="sm" onClick={acceptCookies}>
            Got it
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
