"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { forgotPasswordAction, type ActionState } from "@/app/actions/auth";

export function ForgotPasswordForm() {
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
        return await forgotPasswordAction(prevState, formData);
      } catch (err: any) {
        return {
          success: false,
          error: err?.message || "An error occurred. Please try again.",
        };
      }
    },
    { success: false, error: null }
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle><h1 className="text-2xl font-bold">Forgot Password</h1></CardTitle>
        <CardDescription>Enter your email to receive a password reset link.</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          {state.data?.message && (
            <Alert variant="default">
              <AlertDescription>{state.data.message}</AlertDescription>
            </Alert>
          )}
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="your@email.com"
              required
              autoComplete="email"
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...
              </>
            ) : (
              "Send Reset Link"
            )}
          </Button>
          <p className="text-sm text-center text-gray-600">
            <Link href="/login" className="text-blue-600 hover:underline">
              Back to Sign In
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

export default ForgotPasswordForm;
