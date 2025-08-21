import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUser } from "@/lib/auth";

export const dynamic = 'force-dynamic'; // Ensures this route is not cached

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient();
  const results = {
    complexQuery: { time: 0, error: null as string | null, data: null as any },
    simpleQuery: { time: 0, error: null as string | null, data: null as any },
  };

  // --- Test 1: Complex Query with a Join ---
  const complexStart = performance.now();
  try {
    const { data, error } = await supabase
      .from("visits")
      .select("*, wineries(name)") // Join with wineries table
      .eq("user_id", user.id)
      .limit(10);
    if (error) throw error;
    results.complexQuery.data = data;
  } catch (e: any) {
    results.complexQuery.error = e.message;
  }
  results.complexQuery.time = performance.now() - complexStart;


  // --- Test 2: Simple Query without a Join ---
  const simpleStart = performance.now();
  try {
    const { data, error } = await supabase
      .from("visits")
      .select("id, visit_date, rating") // No join
      .eq("user_id", user.id)
      .limit(10);
    if (error) throw error;
    results.simpleQuery.data = data;
  } catch (e: any) {
    results.simpleQuery.error = e.message;
  }
  results.simpleQuery.time = performance.now() - simpleStart;

  return NextResponse.json(results);
}