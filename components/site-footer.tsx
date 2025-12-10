import Link from "next/link"

export function SiteFooter() {
  return (
    <footer className="border-t py-6 md:py-0">
      <div className="container flex flex-col items-center justify-between gap-4 md:h-16 md:flex-row">
        <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
          Built by <span className="font-medium underline underline-offset-4">Jarred Byrnes</span>.
          The source code is available on <a href="https://github.com/byrnesjd4821/finger-lakes-app-57" target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4">GitHub</a>.
        </p>
        <div className="flex gap-4">
          <Link href="/privacy" className="text-sm font-medium underline underline-offset-4 text-muted-foreground hover:text-foreground">
            Privacy Policy
          </Link>
          <Link href="/terms" className="text-sm font-medium underline underline-offset-4 text-muted-foreground hover:text-foreground">
            Terms of Service
          </Link>
        </div>
      </div>
    </footer>
  )
}
