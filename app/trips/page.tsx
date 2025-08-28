// File Location: app/trips/page.tsx
import { redirect } from "next/navigation";

// Redirect to the upcoming trips page by default
export default function TripsPage() {
  redirect("/trips/upcoming");
}