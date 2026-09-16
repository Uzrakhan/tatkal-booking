"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Seat = {
  id: number;
  status: "available" | "locked" | "booked";
  locked_until: string | null;
  lock_token: string | null;
};

const ROW_LABELS = ["A","B","C","D","E"]
const SEATS_PER_ROW = 10;


const SeatButton = memo(function SeatButton({
  seat,
  isBooking,
  isMine,
  isPending,
  onLock,
}: {
  seat: Seat;
  isBooking: boolean;
  isMine: boolean;
  isPending: boolean;
  onLock: (seatId: number) => void;
}) {
  const isLocked = seat.status === "locked";
  const isBooked = seat.status === "booked";

  const fill = isBooked
    ? "bg-[#A6414A] text-[#F5EFE6]/90"
    : isLocked
      ? "bg-[#E3A857] text-[#241A08]"
      : "bg-[#3FA796] text-[#07231F] motion-safe:hover:scale-[1.08] motion-safe:hover:bg-[#4CC2AE]";

  return (
    <button
      disabled={isBooked || isLocked || isBooking}
      onClick={() => onLock(seat.id)}
      aria-label={`Seat ${seat.id}, ${seat.status}`}
      className={`relative h-8 w-7 shrink-0 rounded-t-[9px] rounded-b-[3px] text-[10px] font-semibold transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E3A857] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D0B12] disabled:cursor-not-allowed sm:h-10 sm:w-9 sm:text-xs md:h-11 md:w-10 ${fill} ${
        isMine ? "ring-2 ring-[#F5EFE6] ring-offset-2 ring-offset-[#0D0B12]" : ""
      }`}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-[9px] bg-white/15" />
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
  const [lockToken, setLockToken] = useState<string | null>(null);

  useEffect(() => {
    const existingToken = sessionStorage.getItem("lockToken");

    if (existingToken) {
      setLockToken(existingToken);
      return;
    }

    const newToken = crypto.randomUUID();
    sessionStorage.setItem("lockToken", newToken);
    setLockToken(newToken);
  }, []);


  useEffect(() => {
    if (!lockToken) return;
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
    if (!lockToken) return
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
    if (!lockedSeat || !lockToken) return;

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
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0D0B12] text-[#A9A0B5]">
        Loading seats...
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#0D0B12] px-4 py-10 text-[#F5EFE6] sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col items-center">
        <div className="mb-3 flex gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-[#E3A857]/70"
            />
          ))}
        </div>
 
        <h1 className="bg-gradient-to-r from-[#F3C978] to-[#C9832E] bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-5xl">
          Tatkal Cinema
        </h1>
 
        <p className="mt-2 mb-10 text-sm text-[#A9A0B5] sm:text-base">
          One screening, fifty seats, just pick yours.
        </p>
 
        <div className="relative mb-3 h-16 w-full max-w-md sm:h-20">
          <div
            className="absolute inset-x-0 top-0 h-full rounded-[50%] border-t-2 border-[#E3A857]/60"
            style={{ clipPath: "inset(0 0 55% 0)" }}
          />
        </div>
        <p className="mb-10 text-xs tracking-widest text-[#E3A857]/80">
          Screen
        </p>
 
        {lockedSeat && (
          <div className="mb-10 w-full max-w-xs rounded-xl border border-[#E3A857]/40 bg-[#17131F] p-5 text-center shadow-[0_0_0_1px_rgba(227,168,87,0.08)]">
            <p className="text-xs text-[#A9A0B5]">Held for you</p>
            <p className="mt-1 mb-4 text-2xl font-bold text-[#F5EFE6]">
              Seat {lockedSeat}
            </p>
            <button
              onClick={confirmBooking}
              disabled={bookingSeat === lockedSeat}
              className="w-full rounded-lg bg-[#E3A857] px-6 py-3 font-semibold text-[#241A08] transition motion-safe:hover:bg-[#F3C978] disabled:opacity-50"
            >
              {bookingSeat === lockedSeat ? "Booking…" : "Confirm booking"}
            </button>
          </div>
        )}
 
        <div className="flex flex-col gap-2.5 sm:gap-3">
          {ROW_LABELS.map((rowLabel, rowIndex) => {
            const start = rowIndex * SEATS_PER_ROW;
            const rowSeats = seats.slice(start, start + SEATS_PER_ROW);
            const left = rowSeats.slice(0, 5);
            const right = rowSeats.slice(5, 10);
 
            if (rowSeats.length === 0) return null;
 
            return (
              <div
                key={rowLabel}
                className="flex items-center justify-center gap-2 sm:gap-3"
              >
                <span className="w-3 text-xs font-medium text-[#A9A0B5] sm:w-5 sm:text-sm">
                  {rowLabel}
                </span>
                <div className="flex gap-1.5 sm:gap-2">
                  {left.map((seat) => (
                    <SeatButton
                      key={seat.id}
                      seat={seat}
                      isBooking={bookingSeat === seat.id}
                      isMine={lockedSeat === seat.id}
                      onLock={lockSeat}
                    />
                  ))}
                </div>
                <div className="w-4 sm:w-8" />
                <div className="flex gap-1.5 sm:gap-2">
                  {right.map((seat) => (
                    <SeatButton
                      key={seat.id}
                      seat={seat}
                      isBooking={bookingSeat === seat.id}
                      isMine={lockedSeat === seat.id}
                      onLock={lockSeat}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
 
        <div className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-[#A9A0B5] sm:text-sm">
          <div className="flex items-center gap-2">
            <span className="h-3.5 w-3 rounded-t-[5px] rounded-b-[2px] bg-[#3FA796]" />
            Available
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3.5 w-3 rounded-t-[5px] rounded-b-[2px] bg-[#E3A857]" />
            Locked
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3.5 w-3 rounded-t-[5px] rounded-b-[2px] bg-[#A6414A]" />
            Booked
          </div>
        </div>
      </div>
    </main>
  );
}