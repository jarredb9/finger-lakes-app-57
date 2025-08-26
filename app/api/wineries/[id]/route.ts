// File: app/api/wineries/[id]/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUser } from "@/lib/auth";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const user = await getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const wineryId = parseInt(params.id, 10);
    if (isNaN(wineryId)) {
        return NextResponse.json({ error: "Invalid winery ID" }, { status: 400 });
    }

    const supabase = await createClient();

    try {
        const { data: winery, error } = await supabase
            .from('wineries')
            .select('*')
            .eq('id', wineryId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return NextResponse.json({ error: "Winery not found" }, { status: 404 });
            }
            throw error;
        }

        return NextResponse.json(winery);

    } catch (error) {
        console.error("Error fetching winery:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}