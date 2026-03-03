import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Settings } from "lucide-react";
import PrivacySettings from "@/components/PrivacySettings";

export const metadata = {
  title: "Settings | Winery Tracker",
  description: "Manage your account and privacy settings.",
};

export default async function SettingsPage() {
    const user = await getUser();

    if (!user) {
        redirect("/login");
    }

    return (
        <div data-testid="settings-page-container" className="container mx-auto py-10 px-4 md:px-6 max-w-4xl min-h-screen">
            <div className="mb-6">
                <Button asChild variant="ghost" className="pl-0 hover:bg-transparent hover:text-primary">
                    <Link href="/" className="flex items-center gap-2">
                        <ArrowLeft className="h-4 w-4" />
                        Back to App
                    </Link>
                </Button>
            </div>

            <div className="flex items-center gap-3 mb-8">
                <Settings className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-bold">Settings</h1>
            </div>

            <div className="space-y-8">
                <section>
                    <h2 className="text-xl font-semibold mb-4">Privacy</h2>
                    <PrivacySettings />
                </section>

                {/* Future settings sections can be added here */}
                <section className="pt-6 border-t">
                    <h2 className="text-xl font-semibold mb-2">Account</h2>
                    <p className="text-sm text-muted-foreground">
                        Logged in as <span className="font-medium text-foreground">{user.email}</span>
                    </p>
                    <div className="mt-4">
                        <Button asChild variant="outline" size="sm">
                            <Link href="/logout">Log out</Link>
                        </Button>
                    </div>
                </section>
            </div>
        </div>
    );
}
