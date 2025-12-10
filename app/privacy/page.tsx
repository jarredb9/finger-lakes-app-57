import Link from "next/link"

export default function PrivacyPolicy() {
  return (
    <div className="container mx-auto py-10 px-4 md:px-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-8">Last Updated: {new Date().toLocaleDateString()}</p>

      <div className="space-y-6">
        <section>
          <h2 className="text-xl font-semibold mb-2">1. Introduction</h2>
          <p>
            Welcome to the Winery Planner ("we," "our," or "us"). We are committed to protecting your privacy. 
            This Privacy Policy explains how we collect, use, and safeguard your information when you use our application.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">2. Information We Collect</h2>
          <p className="mb-2">We collect the following types of information:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Account Information:</strong> When you sign up, we collect your email address and name to create and manage your account.</li>
            <li><strong>Usage Data:</strong> We collect data on the wineries you visit, lists you create, and other interactions within the app to provide the service.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">3. How We Use Your Information</h2>
          <p>We use your information solely to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Provide, operate, and maintain the application.</li>
            <li>Manage your account and login sessions.</li>
            <li>Allow you to track your winery visits and share lists with friends.</li>
          </ul>
          <p className="mt-2 font-medium">We do not sell, rent, or trade your personal information to third parties.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">4. Cookies and Tracking Technologies</h2>
          <p>
            We use cookies primarily for authentication and security purposes.
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Essential Cookies:</strong> These are required for you to log in and access your account. We use Supabase for authentication, which relies on these cookies.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">5. Third-Party Services</h2>
          <p>We use the following third-party services which may collect information according to their own privacy policies:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              <strong>Google Maps API:</strong> We use Google Maps to display winery locations. By using this app, you are bound by 
              <Link href="https://www.google.com/intl/en/policies/privacy/" className="text-primary hover:underline ml-1" target="_blank" rel="noopener noreferrer">
                Google's Privacy Policy
              </Link>.
            </li>
            <li>
              <strong>Supabase:</strong> We use Supabase for database hosting and authentication. You can review 
              <Link href="https://supabase.com/privacy" className="text-primary hover:underline ml-1" target="_blank" rel="noopener noreferrer">
                Supabase's Privacy Policy
              </Link>.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">6. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact us at TheWineryTrackerApp@gmail.com.
          </p>
        </section>
      </div>
    </div>
  )
}
