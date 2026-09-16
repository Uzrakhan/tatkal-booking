import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const seatId = Number(body.seatId);
    const lockToken = body.lockToken;

    if (
      !Number.isInteger(seatId) ||
      seatId < 1 ||
      seatId > 50
    ) {
      return NextResponse.json(
        { error: "Invalid seat ID" },
        { status: 400 }
      );
    }

    if (!lockToken) {
      return NextResponse.json(
        { error: "Lock token is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("lock_seat", {
      p_seat_id: seatId,
      p_lock_token: lockToken,
    });

    if (error) {
      if (error.message.includes("Seat Already Locked")) {
        return NextResponse.json(
          { error: "Seat Already Locked" },
          { status: 409 }
        );
      }

      console.error("Lock error:", error);

      return NextResponse.json(
        { error: "Unable to lock seat" },
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