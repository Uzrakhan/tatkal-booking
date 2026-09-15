import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  console.log("SUPABASE URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);

  const { data, error } = await supabase
    .from("seats")
    .select("*")
    .order("id");

  console.log("SUPABASE DATA:", data);
  console.log("SUPABASE ERROR:", error);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}