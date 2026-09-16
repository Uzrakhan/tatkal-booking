import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {

  const { data, error } = await supabase
    .from("seats")
    .select("*")
    .order("id");


  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  const seats = data.map((seat) => {
    if (
      seat.status === "locked" &&
      seat.locked_until &&
      new Date(seat.locked_until) <= new Date()
    ) {
      return {
        ...seat,
        status: "available",
        locked_until: null,
        lock_token: null,
      };
    }

    return seat;
  });

  return NextResponse.json(seats);
}