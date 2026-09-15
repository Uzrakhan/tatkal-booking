"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Seat = {
  id: number;
  status: "available" | "locked" | "booked";
  locked_until: string | null;
};


const SeatButton = memo(function SeatButton({
  seat,
  isBooking,
  isPending,
  onBook,
}: {
  seat: Seat;
  isBooking: boolean;
  isPending: boolean;
  onBook: (seatId: number) => void;
}) {
  const isBooked = seat.status === "booked" || isPending;

  return (
    <button
      disabled={isBooked || isBooking}
      onClick={() => onBook(seat.id)}
      className={`aspect-square rounded-lg font-semibold transition ${
        seat.status === "booked"
          ? "cursor-not-allowed bg-red-500 text-white"
          : "bg-green-500 text-white hover:scale-105"
      }`}
    >
      {isBooking ? "..." : seat.id}
    </button>
  );
});

export default function Home() {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingSeat, setBookingSeat] = useState<number | null>(null);
  const [pendingSeat, setPendingSeat] = useState<number | null>(null)

  useEffect(() => {
    async function fetchSeats() {
      try {
        const response = await fetch("/api/seats");
        const data = await response.json();

        setSeats(data);
      } catch (error) {
        console.error("Failed to fetch seats:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchSeats();
  }, []);

  // Listen for database changes in real time
  useEffect(() => {
    const channel = supabase
      .channel("seats-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "seats",
        },
        (payload) => {
          console.log("🔥 REALTIME EVENT:", payload);

          const updatedSeat = payload.new as Seat;

          setSeats((currentSeats) =>
            currentSeats.map((seat) =>
              seat.id === updatedSeat.id
                ? updatedSeat
                : seat
            )
          );
        }
      )
      .subscribe((status) => {
        console.log("Realtime status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);


  const bookSeat = useCallback(async (seatId: number) => {
    setBookingSeat(seatId);

    //immediately show this seat as booked
    setPendingSeat(seatId)

    try {
      const response = await fetch("/api/book", {
        method: "POST",
        headers: {
          "Content-Type": "appliation/json"
        },
        body: JSON.stringify({
          seatId
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        //roll back optimistic state
        setPendingSeat(null)

        alert(data.error)
        return
      }

      //server confirmed booking
      setSeats((currentSeats) => 
        currentSeats.map((seat) => 
          seat.id === seatId
            ? {...seat, status: "booked"}
            : seat
        )
      );

      setPendingSeat(null)
    } catch(error) {
      console.error("Booking failed:", error)

      setPendingSeat(null)
      alert("Something went wrong.")
    }finally {
      setBookingSeat(null)
    }
  }, []);

  if (loading) {
    return <main>Loading seats...</main>;
  }

  return (
    <main className="min-h-screen p-8">
      <h1 className="mb-2 text-3xl font-bold">
        Tatkal Cinema
      </h1>

      <p className="mb-8 text-gray-500">
        Select your seat
      </p>

      <div className="mb-8 flex justify-center">
        <div className="w-full max-w-2xl">
          <div className="mb-10 rounded bg-gray-200 p-3 text-center">
            SCREEN
          </div>

          <div className="grid grid-cols-5 gap-4 sm:grid-cols-10">
            {seats.map((seat) => (
             <SeatButton 
                key={seat.id}
                seat={seat}
                isBooking={bookingSeat === seat.id}
                isPending={pendingSeat === seat.id}
                onBook={bookSeat}
             />
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-center gap-6">
        <div>
          🟢 Available
        </div>

        <div>
          🔴 Booked
        </div>
      </div>
    </main>
  );
}