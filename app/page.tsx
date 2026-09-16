"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Seat = {
  id: number;
  status: "available" | "locked" | "booked";
  locked_until: string | null;
  lock_token: string | null;
};


const SeatButton = memo(function SeatButton({
  seat,
  isBooking,
  isPending,
  onLock,
}: {
  seat: Seat;
  isBooking: boolean;
  isPending: boolean;
  onLock: (seatId: number) => void;
}) {
  const isLocked = seat.status === "locked";
  const isBooked = seat.status === "booked";

  return (
    <button
      disabled={isBooked || isLocked || isBooking}
      onClick={() => onLock(seat.id)}
      className={`aspect-square min-w-0 overflow-hidden rounded-lg px-1 text-xs font-semibold transition sm:text-sm ${
        isBooked
          ? "cursor-not-allowed bg-red-500 text-white"
          : isLocked
            ? "cursor-not-allowed bg-yellow-400 text-black"
            : "bg-green-500 text-white hover:scale-105"
      }`}
    >
      {isBooking
        ? "..."
        : isBooked
          ? "✓"
          : isLocked
            ? "🔒"
            : seat.id}
    </button>
  );
});


export default function Home() {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingSeat, setBookingSeat] = useState<number | null>(null);
  const [pendingSeat, setPendingSeat] = useState<number | null>(null)
  const [lockedSeat, setLockedSeat] = useState<number | null>(null)
  const [lockToken] = useState(() => {
    const existingToken = sessionStorage.getItem("lockToken");

    if (existingToken) {
      return existingToken;
    }

    const newToken = crypto.randomUUID();
    sessionStorage.setItem("lockToken", newToken);

    return newToken;
  });


  useEffect(() => {
    async function fetchSeats() {
      try {
        const response = await fetch("/api/seats");
        const data = await response.json();

        setSeats(data);

        const myLockedSeat = data.find(
            (seat: Seat) =>
              seat.status === "locked" &&
              seat.lock_token === lockToken
          );
        if (myLockedSeat) {
          setLockedSeat(myLockedSeat.id);
        }
      } catch (error) {
        console.error("Failed to fetch seats:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchSeats();
  }, [lockToken]);

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

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        await fetch("/api/expire-locks", {
          method: "POST",
        });

        const response = await fetch("/api/seats", {
          cache: "no-store",
        });

        const data = await response.json();

        setSeats(data);

        if (
          lockedSeat &&
          !data.some(
            (seat: Seat) =>
              seat.id === lockedSeat &&
              seat.status === "locked"
          )
        ) {
          setLockedSeat(null);
        }
      } catch (error) {
        console.error("Failed to refresh seats:", error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lockedSeat]);

  

  const lockSeat = useCallback(async (seatId: number) => {
    setBookingSeat(seatId);

    try {
      const response = await fetch("/api/lock", {
        method: "POST",
        headers: {
           "Content-Type": "application/json",
        },
        body: JSON.stringify({
          seatId,
          lockToken
        })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error)
        return;
      }

      setLockedSeat(seatId);

      setSeats((currentSeats) =>
        currentSeats.map((seat) =>
          seat.id === seatId
            ? {
                ...seat,
                status: "locked",
                locked_until: data.seat.locked_until,
                lock_token: data.seat.lock_token,
              }
            : seat
        )
      );
    } catch (error) {
      console.error("Lock failed:", error)
      alert("Something went wrong")
    } finally {
      setBookingSeat(null)
    }
  }, [lockToken]);

  const confirmBooking = useCallback(async () => {
    if (!lockedSeat) return;

    setBookingSeat(lockedSeat);

    try {
      const response = await fetch("/api/book", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          seatId: lockedSeat,
          lockToken,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error);

        // Refresh authoritative state
        const seatsResponse = await fetch("/api/seats", {
          cache: "no-store",
        });

        const seatsData = await seatsResponse.json();
        setSeats(seatsData);
        setLockedSeat(null);

        return;
      }

      setSeats((currentSeats) =>
        currentSeats.map((seat) =>
          seat.id === lockedSeat
            ? data.seat
            : seat
        )
      );

      setLockedSeat(null);
    } catch (error) {
      console.error("Booking failed:", error);
      alert("Something went wrong.");
    } finally {
      setBookingSeat(null);
    }
  }, [lockedSeat, lockToken]);


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

          {lockedSeat && (
            <div className="mb-6 rounded-lg border p-4 text-center">
              <p className="mb-3 font-semibold">
                Seat {lockedSeat} is locked for you.
              </p>

              <button
                onClick={confirmBooking}
                disabled={bookingSeat === lockedSeat}
                className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {bookingSeat === lockedSeat
                  ? "Booking..."
                  : "Confirm Booking"}
              </button>
            </div>
          )}

          <div className="grid grid-cols-5 gap-4 sm:grid-cols-10">
            {seats.map((seat) => (
             <SeatButton 
                key={seat.id}
                seat={seat}
                isBooking={bookingSeat === seat.id}
                isPending={pendingSeat === seat.id}
                onLock={lockSeat}
             />
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-center gap-6">
        <div>🟢 Available</div>
        <div>🟡 Locked</div>
        <div>🔴 Booked</div>
      </div>
    </main>
  );
}