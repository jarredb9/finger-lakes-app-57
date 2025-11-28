import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { password, code } = await request.json();

  if (!password || !code) {
    return NextResponse.json({ error: "Password and code are required" }, { status: 400 });
  }

  const supabase = await createClient();

  // Exchange the code for a session
  const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

  if (sessionError) {
    console.error("Error exchanging code for session:", sessionError);
    return NextResponse.json({ error: "Invalid or expired reset token." }, { status: 400 });
  }

  if (!sessionData.session) {
      return NextResponse.json({ error: "Could not authenticate user." }, { status: 401 });
  }

  // Set the session to act on behalf of the user
  const { error: userError } = await supabase.auth.setSession(sessionData.session);

  if (userError) {
      console.error("Error setting session:", userError);
      return NextResponse.json({ error: "Could not set user session." }, { status: 500 });
  }

  // Update the user's password
  const { error: updateError } = await supabase.auth.updateUser({ password });

  if (updateError) {
    console.error("Error updating password:", updateError);
    return NextResponse.json({ error: "Failed to update password." }, { status: 500 });
  }

  // Sign out the user to clear the temporary session
  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) {
      console.error("Error signing out after password reset:", signOutError);
      // Don't block the success response, but log the error
  }

  return NextResponse.json({ message: "Password updated successfully" });
}
