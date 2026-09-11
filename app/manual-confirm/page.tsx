import type { Metadata } from "next";
import { ManualConfirmForm } from "@/components/manual-confirm-form";

export const metadata: Metadata = {
  title: "Manual Account Confirmation | The Winery Planner App",
  description: "Manually confirm your Winery Planner account",
};

export default function ManualConfirmPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <ManualConfirmForm />
    </div>
  );
}