# Tatkal Cinema

A real-time movie theater seat booking system built as a concurrency-safe booking challenge.

The application manages exactly 50 seats and supports:

- Real-time seat synchronization across browser tabs
- 60-second temporary seat locks
- Lock ownership using **UUID** tokens
- Atomic concurrency-safe seat locking
- Secure booking confirmation
- Automatic expiration of abandoned locks
- Optimistic UI with server-side validation
- PostgreSQL-backed source of truth
- Responsive, cinema-inspired frontend

## Live Demo

**Vercel:** [https://tatkal-booking-nine.vercel.app/] (https://tatkal-booking-nine.vercel.app/)

## GitHub

**Repository:** [https://github.com/Uzrakhan/tatkal-booking](https://github.com/Uzrakhan/tatkal-booking)

---

## Overview

Tatkal Cinema simulates a small movie theater with 50 seats.

A user cannot directly book an available seat.

The booking flow is:

```text
Available
    ↓
Lock for 60 seconds
    ↓
### Confirm Booking
    ↓
Booked

If the user does not confirm within 60 seconds, the lock expires and the seat becomes available again.

The important part of the implementation is that seat ownership and concurrency are enforced at the database level rather than relying on frontend state.

### Key Features

Real-Time Seat Updates

Supabase Realtime listens for changes to the seats table.

When a seat changes in one browser tab, the change is propagated to other connected tabs without requiring a page refresh.

### Temporary Seat Locking

Selecting a seat creates a **UUID** lock token and attempts to lock the seat for 60 seconds.

The lock is stored in PostgreSQL using:

status locked_until lock_token ### Lock Ownership

Each browser session receives a unique **UUID** lock token.

A user can only confirm a booking when their token matches the token stored for the locked seat.

### Automatic Lock Expiration

Locks expire after 60 seconds.

Expired locks are released through a PostgreSQL function using the database's now() timestamp as the authoritative clock.

### Concurrency Safety

Seat locking is performed using an atomic conditional database update.

This prevents two concurrent requests from successfully acquiring the same seat.

Optimistic UI

The frontend immediately provides visual feedback when a user attempts to lock a seat.

The database remains authoritative.

If the lock request fails because another user acquired the seat first, the optimistic state is rolled back.

### Responsive Frontend

The interface is designed as a cinema-style seat selection experience with:

Responsive seat grid
Clear Available / Locked / Booked states
Visual indication of the user's own locked seat
Accessible seat labels
Responsive layout across desktop and mobile
Architecture
    ┌──────────────────┐
    │   Next.js Client │
    │                  │
    │  React + TS      │
    └────────┬─────────┘
    │
    ┌─────────────┼─────────────┐
    │             │             │
    ▼             ▼             ▼
    **GET** /seats     **POST** /lock    **POST** /book
    │             │             │
    │             ▼             ▼
    │       lock_seat()     book_seat()
    │             │             │
    └─────────────┼─────────────┘
    ▼
    ┌──────────────────┐
    │    Supabase      │
    │   PostgreSQL     │
    │                  │
    │   seats table    │
    └────────┬─────────┘
    │
    ▼
    Supabase Realtime
    │
    ┌─────────────┴─────────────┐
    ▼                           ▼
    Browser A                   Browser B

PostgreSQL is the source of truth for seat state.

The frontend represents the current server state and provides responsive UI feedback.

### Tech Stack

Frontend Next.js React TypeScript Tailwind **CSS** Backend Next.js Route Handlers Supabase PostgreSQL PostgreSQL Functions / **RPC** ### Supabase Realtime Deployment Vercel ### Seat State Model

Each seat contains:

id status locked_until lock_token

The status can be:

available locked booked

There are exactly 50 seats:

1 - 50 ### Booking Flow ## Available Seat

A seat initially has:

status = available

The user can select it from the seat map.

## Lock Seat

When the user selects a seat, the frontend generates a **UUID** lock token for the browser session.

Example request:

{
    *seatId*: 12,
    *lockToken*: *uuid*
}

The request is sent to:

**POST** /api/lock

The **API** calls the PostgreSQL function:

lock_seat()

The seat can only be locked when it is:

available

or when an existing lock has already expired.

The lock duration is:

60 seconds ## Confirm Booking

After acquiring a lock, the user can confirm the booking.

The frontend sends:

{
    *seatId*: 12,
    *lockToken*: *uuid*
}

to:

**POST** /api/book

The database verifies:

seat exists **AND** status = locked **AND** lock token matches **AND** lock has not expired

Only after these conditions pass is the seat changed to:

booked ### Concurrency Handling

The main challenge is preventing multiple users from acquiring the same seat simultaneously.

For example, five users attempt to lock Seat 12 at approximately the same time:

User A ─┐ User B ─┤ User C ─┼──→ lock_seat(12) User D ─┤ User E ─┘

The database performs the lock using an atomic conditional **UPDATE**.

Conceptually:

**UPDATE** public.seats
**SET**
    status = 'locked',
    locked_until = db_now + interval '60 seconds',
    lock_token = p_lock_token
**WHERE** id = p_seat_id
    **AND** (
    status = 'available'
    OR (
    status = 'locked'
    **AND** locked_until <= db_now
    )
    );

The condition and update happen inside PostgreSQL as one database operation.

Therefore, concurrent requests cannot all successfully acquire the same available row.

Expected result:

1 × **200** OK 4 × **409** Conflict

The rejected requests receive a conflict response indicating that the seat is already locked or booked.

This prevents double booking at the database level rather than relying on frontend state.

### Lock Ownership

Each browser session receives a **UUID**:

lockToken

The token is persisted in:

sessionStorage

This allows an active lock to survive a page refresh within the same browser tab.

A booking can only succeed when:

status = 'locked' **AND** lock_token = p_lock_token **AND** locked_until > now()

This prevents another client from confirming a lock that belongs to a different browser session.

### Lock Expiration

Temporary locks are valid for 60 seconds.

The expiration time is stored in:

locked_until

Expired locks are released through:

release_expired_locks()

The function uses PostgreSQL's:

now()

as the authoritative clock.

When a lock expires:

locked ↓ available

The associated lock information is cleared:

locked_until → null lock_token   → null

This avoids relying on the client's local system clock for determining whether a lock has expired.

Real-Time Synchronization

Supabase Realtime subscribes to changes on:

public.seats

For example:

Browser A
    │
    │ locks Seat 20
    ▼
PostgreSQL **UPDATE**
    │
    ▼
### Supabase Realtime
    │
    ▼
Browser B

When the database changes, connected clients receive the update and update the corresponding seat in the UI.

This allows multiple browser tabs to stay synchronized in real time.

Optimistic UI

The seat-selection UI provides immediate feedback while the lock request is being processed.

The flow is:

User clicks seat
      ↓
UI immediately shows pending state
      ↓
**POST** /api/lock
      ↓
PostgreSQL makes authoritative decision
      ↓
 ┌───────────────┴───────────────┐
 ▼                               ▼
Success                         Failure
 ▼                               ▼
Locked state                    Roll back
Confirm button                  optimistic state

The optimistic state is therefore never treated as proof that the seat was successfully acquired.

The database remains the final authority.

### Frontend Performance

The seat grid contains 50 interactive seat components.

Each seat is rendered through a memoized component:

React.memo(SeatButton)

Event handlers use:

useCallback()

Realtime updates replace the changed seat while preserving unchanged seat objects.

This helps avoid unnecessary component updates when an individual seat changes.

The seat layout also uses a stable structure so that changing a seat's state does not cause the surrounding grid to shift.

**API** **GET** /api/seats

Returns the current state of all 50 seats.

Example:

[
    {
    *id*: 1,
    *status*: *available*,
    *locked_until*: null,
    *lock_token*: null
    }
]
**POST** /api/lock

Attempts to acquire a 60-second lock.

Request:

{
    *seatId*: 12,
    *lockToken*: *uuid*
}

Possible responses:

**200** OK Seat successfully locked **409** Conflict ### Seat Already Locked **400** Bad Request Invalid seat ID / missing lock token **POST** /api/book

Confirms a previously locked seat.

Request:

{
    *seatId*: 12,
    *lockToken*: *uuid*
}

Possible responses:

**200** OK Booking successful **409** Conflict Lock expired or seat is not yours **POST** /api/expire-locks

Triggers cleanup of expired locks through the PostgreSQL:

release_expired_locks()

function.

The actual expiration decision is made using PostgreSQL's database clock.

### Database Functions

lock_seat(seat_id, lock_token)

Atomically acquires a seat lock if the seat is available or its previous lock has expired.

book_seat(seat_id, lock_token)

Validates lock ownership and expiration before changing the seat to booked.

release_expired_locks()

Releases temporary locks whose expiration timestamp has passed.

Testing

The repository includes a concurrency test:

npx tsx scripts/test-concurrency.ts

The test sends five concurrent lock requests for the same seat.

Expected result:

1 successful lock 4 rejected requests

✅ **CONCURRENCY** **TEST** **PASSED**

This verifies that multiple simultaneous requests cannot acquire the same seat.

### Manual Test Scenarios

### Seat Locking Available → Locked

A successful lock displays the locked state and enables booking confirmation.

Booking Locked → Booked

A valid lock token is required to confirm the booking.

### Lock Expiration

Locked → Available

After the 60-second lock period, an abandoned lock is released.

### Concurrent Locking

5 concurrent requests
        ↓
1 successful lock
4 rejected requests
Real-Time Synchronization

A seat state change in one browser tab is reflected in another connected tab through Supabase Realtime.

### Page Refresh

An active lock can be restored after refreshing the same browser tab because its lock token is persisted in sessionStorage.

### Environment Variables

Create a .env.local file:

NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key

The Supabase service-role key is not exposed to the browser.

### Local Development

Clone the repository:

git clone [https://github.com/Uzrakhan/tatkal-booking.git](https://github.com/Uzrakhan/tatkal-booking.git) cd tatkal-booking

Install dependencies:

npm install

Create .env.local with the required Supabase environment variables.

Start the development server:

npm run dev

Open:

[http://localhost:**3000**](http://localhost:**3000**) ### Production Build

To verify the application before deployment:

npm run build

A successful build confirms that the application compiles and passes TypeScript validation.

### Project Structure

tatkal-booking/ │ ├── app/ │   ├── api/ │   │   ├── book/ │   │   │   └── route.ts │   │   ├── expire-locks/ │   │   │   └── route.ts │   │   ├── lock/ │   │   │   └── route.ts │   │   └── seats/ │   │       └── route.ts │   │ │   └── page.tsx │ ├── lib/ │   └── supabase.ts │ ├── scripts/ │   └── test-concurrency.ts │ ├── **README**.md └── package.json Design

The interface uses a dark cinema-inspired visual system with clear visual states:

Green — Available Gold — Locked Red — Booked

The seat map follows a theater-style layout with a central aisle and row labels.

The UI is responsive across desktop and mobile layouts and provides a clear visual distinction between the user's own temporary lock and seats controlled by other users.

### Git History

Development was split into logical commits rather than being submitted as a single large initial commit.

The history includes separate stages for:

Initial project setup Seat booking UI Concurrency testing Booking **API** Seat locking Lock expiration Lock-token ownership Refresh persistence Frontend polish Optimistic UI Documentation

This makes the implementation easier to review and understand.

### Requirements Checklist

Requirement	Implementation
Exactly 50 seats	PostgreSQL seats table
Available / Locked / Booked	Database status + React UI
Temporary locking	lock_seat()
60-second expiration	locked_until
Lock ownership	**UUID** lock_token
Secure confirmation	book_seat()
Concurrent requests	Atomic PostgreSQL update
Double-booking prevention	Database-level concurrency control
Real-time synchronization	Supabase Realtime
Optimistic UI	Pending state + rollback
Frontend optimization	memo + useCallback
Responsive UI	Tailwind **CSS**
Production deployment	Vercel
Concurrency test	scripts/test-concurrency.ts
Author

### Uzra Khan

GitHub: [https://github.com/Uzrakhan](https://github.com/Uzrakhan)

