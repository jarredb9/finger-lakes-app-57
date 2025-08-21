import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = 'force-dynamic'; // Ensures this route is not cached

export async function GET() {
  // NOTE: We are NOT checking for a user. This is for diagnostic purposes only.

  const supabase = createClient();
  const results = {
    complexQuery: { time: 0, error: null as string | null, rowCount: 0 },
    simpleQuery: { time: 0, error: null as string | null, rowCount: 0 },
  };

  // --- Test 1: Complex Query with a Join ---
  const complexStart = performance.now();
  try {
    const { data, error } = await supabase
      .from("visits")
      .select("*, wineries(name)") // Join with wineries table
      .limit(10); // Limit to 10 rows for a standard performance test
    if (error) throw error;
    results.complexQuery.rowCount = data?.length || 0;
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
      .limit(10); // Limit to 10 rows
    if (error) throw error;
    results.simpleQuery.rowCount = data?.length || 0;
  } catch (e: any) {
    results.simpleQuery.error = e.message;
  }
  results.simpleQuery.time = performance.now() - simpleStart;

  return NextResponse.json(results);
}