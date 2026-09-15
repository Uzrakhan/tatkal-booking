import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const seatId = Number(body.seatId);

    if (!Number.isInteger(seatId) || seatId < 1 || seatId > 50) {
      return NextResponse.json(
        { error: "Invalid seat ID" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("book_seat", {
      p_seat_id: seatId,
    });

    if (error) {
      if (error.message.includes("Seat Already Taken")) {
        return NextResponse.json(
          { error: "Seat Already Taken" },
          { status: 409 }
        );
      }

      console.error("Booking error:", error);

      return NextResponse.json(
        { error: "Unable to book seat" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      seat: data,
    });
  } catch (error) {
    console.error("Request error:", error);

    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}