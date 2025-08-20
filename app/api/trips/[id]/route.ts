import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUser } from "@/lib/auth";

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
    console.log(`PUT /api/visits/${params.id} called`);
    const user = await getUser();
    if (!user) {
        console.error("Unauthorized PUT to /api/visits");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const visitId = parseInt(params.id, 10);
    if (isNaN(visitId)) {
        return NextResponse.json({ error: "Invalid visit ID" }, { status: 400 });
    }

    try {
        const { visit_date, user_review, rating } = await request.json();
        if (!visit_date) {
            return NextResponse.json({ error: "Visit date is required" }, { status: 400 });
        }

        const supabase = await createClient();

        const { data, error } = await supabase
            .from("visits")
            .update({
                visit_date,
                user_review: user_review || null,
                rating: rating || null,
            })
            .eq("id", visitId)
            .eq("user_id", user.id)
            .select();

        if (error) {
            console.error("Error updating visit:", error);
            throw error;
        }

        if (data.length === 0) {
            return NextResponse.json({ error: "Visit not found or user not authorized" }, { status: 404 });
        }

        console.log("Visit updated successfully:", data);
        return NextResponse.json({ success: true, visit: data[0] });

    } catch (error) {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const visitId = params.id;
    const supabase = await createClient();

    const { error } = await supabase.from("visits").delete().eq("id", visitId).eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}