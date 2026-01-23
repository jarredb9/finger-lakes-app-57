"use client"

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
    // Use setTimeout to avoid synchronous state update warning and ensure client-side execution
    setTimeout(() => {
      const hasConsented = localStorage.getItem("cookie-consent")
      if (!hasConsented) {
        setShowConsent(true)
      }
    }, 0)
  }, [])

  const acceptCookies = () => {
    localStorage.setItem("cookie-consent", "true")
    setShowConsent(false)
  }

  if (!showConsent) return null

  return (
    <aside 
        className="fixed bottom-0 left-0 right-0 z-50 md:bottom-4 md:left-auto md:right-4 md:w-[340px] md:max-w-sm"
        aria-label="Cookie consent"
    >
      <div className="md:hidden bg-background border-t p-4 flex items-center justify-between gap-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CookieIcon className="h-4 w-4 text-primary shrink-0" />
          <span>We use necessary cookies for login sessions.</span>
        </div>
        <Button size="sm" className="h-8 text-xs shrink-0" onClick={acceptCookies}>
          Got it
        </Button>
      </div>

      <Card className="hidden md:block shadow-lg border-primary/20">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <CookieIcon className="h-4 w-4 text-primary" />
            Cookie Notice
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 pb-2">
          <CardDescription className="text-xs">
            We use strictly necessary cookies to manage your login session. 
            By using our site, you agree to this.
          </CardDescription>
        </CardContent>
        <CardFooter className="p-4 pt-0 justify-end">
          <Button size="sm" className="h-8 text-xs" onClick={acceptCookies}>
            Got it
          </Button>
        </CardFooter>
      </Card>
    </aside>
  )
}
