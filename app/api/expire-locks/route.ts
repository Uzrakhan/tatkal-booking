import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST() {
  const { error } = await supabase.rpc("release_expired_locks");

  if (error) {
    console.error("Failed to expire locks:", error);

    return NextResponse.json(
      { error: "Failed to expire locks" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}