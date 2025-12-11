import Link from "next/link"

export default function TermsOfService() {
  return (
    <div className="container mx-auto py-10 px-4 md:px-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
      <p className="text-sm text-muted-foreground mb-8">Last Updated: {new Date().toLocaleDateString()}</p>

      <div className="space-y-6">
        <section>
          <h2 className="text-xl font-semibold mb-2">1. Acceptance of Terms</h2>
          <p>
            By accessing or using The Winery Tracker App application, you agree to be bound by these Terms of Service. 
            If you do not agree to these terms, please do not use our service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">2. Description of Service</h2>
          <p>
            The Winery Tracker App is a personal project designed to help users explore wineries, create itineraries, and track visits. 
            The service is provided "as is" and "as available" without any warranties.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">3. User Accounts</h2>
          <p>
            You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">4. Third-Party Services</h2>
          <p>
            This application utilizes the Google Maps API. By using our application, you are also bound by 
            <Link href="https://cloud.google.com/maps-platform/terms/" className="text-primary hover:underline ml-1" target="_blank" rel="noopener noreferrer">
              Google's Terms of Service
            </Link>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">5. Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages 
            resulting from your use or inability to use the service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">6. Changes to Terms</h2>
          <p>
            We reserve the right to modify these terms at any time. Your continued use of the application following any changes indicates your acceptance of the new terms.
          </p>
        </section>
      </div>
    </div>
  )
}
