"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";
import { manualConfirmAction, type ActionState } from "@/app/actions/auth";

export function ManualConfirmForm() {
  const [state, formAction, isPending] = useActionState(
    async (
      prevState: ActionState<{ message: string }>,
      formData: FormData
    ): Promise<ActionState<{ message: string }>> => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return {
          success: false,
          error: "You are currently offline. Please check your network connection.",
        };
      }
      try {
        return await manualConfirmAction(prevState, formData);
      } catch (err: unknown) {
        const error = err as { message?: string } | null;
        return {
          success: false,
          error: error?.message || "An error occurred. Please try again.",
        };
      }
    },
    { success: false, error: null }
  );

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Manual Account Confirmation</CardTitle>
        <CardDescription>
          {"If your account needs email confirmation but you haven't received an email, try this manual confirmation."}
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          {state.data?.message && (
            <Alert>
              <AlertDescription>{state.data.message}</AlertDescription>
            </Alert>
          )}
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="your@email.com"
              required
            />
          </div>
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Confirming..." : "Confirm Account"}
          </Button>
          <div className="text-center">
            <Link href="/login" className="text-blue-600 hover:underline text-sm">
              Back to Sign In
            </Link>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}

export default ManualConfirmForm;
