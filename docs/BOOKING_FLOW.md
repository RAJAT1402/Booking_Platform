# Booking Flow

How a user goes from browsing a show to holding a confirmed ticket, and what the
backend does at each step.

Code involved:

| File | Role |
|------|------|
| [`src/modules/booking/booking.controller.ts`](../src/modules/booking/booking.controller.ts) | Routes for lock / unlock / confirm / list / cancel |
| [`src/modules/booking/booking.service.ts`](../src/modules/booking/booking.service.ts) | All booking business logic |
| [`src/modules/booking/dto/seat-selection.dto.ts`](../src/modules/booking/dto/seat-selection.dto.ts) | `{ showId, showSeatIds[] }` — shared by lock / unlock / confirm |
| [`src/modules/ticket/ticket.service.ts`](../src/modules/ticket/ticket.service.ts) | Issues the one ticket per confirmed booking |
| [`src/modules/ticket/ticket.controller.ts`](../src/modules/ticket/ticket.controller.ts) | Routes for fetching / re-issuing a ticket |
| [`src/redis/redis.service.ts`](../src/redis/redis.service.ts) | Atomic seat locks (Lua scripts) |
| [`src/modules/show/show.service.ts`](../src/modules/show/show.service.ts) | `getSeatMap()` — what the user picks seats from |

## Endpoints

All booking routes are **authed** (the global `JwtAuthGuard` applies; none are
`@Public()`). The user is read from the JWT via `@CurrentUser()` — the client
never sends a `userId`.

| Method | Route | Status | Description |
|--------|-------|--------|-------------|
| GET | `/shows/:id/seats` | 200 | Public seat map: every seat with live status + price |
| POST | `/bookings/lock` | 200 | Hold `showSeatIds` for this user for 2 minutes |
| POST | `/bookings/unlock` | 200 | Release a hold early |
| POST | `/bookings` | 201 | Convert held seats into a `CONFIRMED` booking |
| GET | `/bookings` | 200 | This user's bookings, newest first |
| GET | `/bookings/:id` | 200 | One booking (owner or `ADMIN` only) |
| POST | `/bookings/:id/cancel` | 200 | Cancel and return the seats to the pool |
| GET | `/tickets/booking/:bookingId` | 200 | The ticket for a booking (owner or `ADMIN`) |
| POST | `/tickets/booking/:bookingId` | 200 | Issue the ticket — idempotent retry path |

Every response is wrapped by `ResponseInterceptor` as
`{ code, data, message }`.

## The happy path

```
1. GET  /shows/:id/seats          → seat map (AVAILABLE / LOCKED / BOOKED + price)
2. POST /bookings/lock            → { lockedSeatIds, expiresAt, ttlSeconds: 120 }
       user has 2 minutes
3. POST /bookings                 → booking with status CONFIRMED + its ticket
       (or POST /bookings/unlock, or just let the hold expire)
```

### 1. Seat map — `showService.getSeatMap(showId)`

Returns one row per `ShowSeat`, ordered by row then number:
`{ showSeatId, seatId, row, number, category, price, status, lockedUntil }`.

The client selects seats by **`showSeatId`**, not `seatId` — a `ShowSeat` is the
per-show instance of a physical `Seat`, and it carries the status and the price.

**Lazy expiry:** a seat still stored as `LOCKED` whose `lockedUntil` is in the
past is reported as `AVAILABLE` with `lockedUntil: null`. The DB row is not
rewritten; the Redis key is what actually expires. See
[Lock expiry](#lock-expiry-two-sources-of-truth).

### 2. Lock — `bookingService.lockSeats(userId, dto)`

Holds seats for `SEAT_LOCK_TTL_MS` (2 minutes), **all-or-nothing** — if any one
seat is unavailable, nothing is locked.

1. `requireBookableShow(showId)` — show must exist and be `SCHEDULED`
   (404 / 400 otherwise).
2. Fetch the `ShowSeat` rows for the given ids **scoped to `showId`**; if the
   count doesn't match the request, → **404** (an id belongs to another show or
   doesn't exist).
3. If any seat is already `BOOKED` → **409**.
4. `redis.acquireSeatLocks(...)` — a single Lua script that succeeds only if
   every key is free or already held by this same user, then `SET`s all of them
   with a 120s TTL. Failure → **409** "currently held by another user".
   This is the concurrency gate: because it's one Lua script, two users racing
   for the same seat cannot both win.
5. Mirror the hold into Postgres: `showSeat.updateMany` → `LOCKED` +
   `lockedUntil = now + 2min`, guarded by `status != BOOKED`.

Returns `{ showId, lockedSeatIds, expiresAt, ttlSeconds }`. Re-locking seats you
already hold is idempotent and **refreshes** the TTL.

### 3. Confirm — `bookingService.confirm(userId, dto)`

1. `requireBookableShow(showId)` again.
2. **Ownership check:** `redis.getSeatLockHolders(...)` must return this
   `userId` for *every* seat. An expired key returns `null`, so an expired hold
   fails here → **409** "Seat hold expired or not owned by you". Redis is the
   authority, not the `LOCKED` row in Postgres.
3. In a single `prisma.$transaction`:
   - re-fetch the `ShowSeat` rows (with `seat`) scoped to `showId` → count
     mismatch = **404**, any `BOOKED` = **409**;
   - sum `showSeat.price` into `totalAmount` using `Prisma.Decimal` (no float
     arithmetic on money);
   - create the `Booking` with `status: CONFIRMED` and a nested
     `BookingSeat` per seat, snapshotting `seatRow`, `seatNumber`,
     `seatCategory`, `price` — so the ticket still reads correctly if seat
     layout or pricing changes later;
   - `updateMany` the seats to `BOOKED`, clear `lockedUntil`, `version++`,
     filtered on `status != BOOKED`. If `booked.count !== showSeatIds.length`
     someone took a seat in between → throw **409**, which rolls the whole
     transaction back (no orphan booking).
4. Release the Redis locks — the seats are permanently `BOOKED`, the locks have
   no more work to do.
5. `ticketService.createTicket(booking.id)` — **after** the transaction has
   committed, so a rolled-back booking can never leave a ticket behind. The
   booking is already `CONFIRMED` here, so a failure is logged and swallowed
   rather than failing the request; the client retries with
   `POST /tickets/booking/:bookingId`.
6. Return `getOne(userId, booking.id)` — the booking with seats, `ticket`, show,
   movie and screen included.

## Ticket — `ticketService.createTicket(bookingId)`

One ticket per confirmed booking, holding a `ticketCode`: 64 hex chars from
`crypto.randomBytes(32)`. The code is the credential that gets scanned at the
gate, so it is CSPRNG output and encodes **nothing** — no user, booking, seat or
timestamp data is derivable from it.

1. Booking must exist → **404**.
2. Booking status must be `CONFIRMED` → **400** otherwise (so a cancelled or
   pending booking can't be ticketed).
3. If a ticket already exists, it is returned as-is — no second code is minted.
4. Otherwise insert `{ bookingId, ticketCode }`; `status` defaults to `ACTIVE`
   and `issuedAt` to `now()`.

**One ticket per booking** is enforced by `Ticket.bookingId @unique`, not just by
the read in step 3: if two requests race, the loser gets `P2002` and re-reads,
returning the winner's ticket. So the method is safe to call any number of times.

`cancel` flips a still-`ACTIVE` ticket to `CANCELLED` inside the same
transaction that frees the seats — a cancelled booking must not leave a
scannable ticket at the gate.

**QR is not stored.** Nothing renders or persists a QR image; the `ticketCode`
is the payload a client (or a later endpoint) encodes into a QR on demand. No
base64 blobs in Postgres.

### Unlock — `bookingService.releaseSeats(userId, dto)`

Deletes only the Redis keys this user still owns (the `RELEASE_LOCKS` script
compares the holder before `DEL`, so it can never free someone else's seat),
then flips rows still `LOCKED` back to `AVAILABLE`. Always returns
`{ released: showSeatIds }` — it does not error on seats that weren't held.

## Cancel — `bookingService.cancel(userId, id, role)`

`getOne` first, which enforces owner-or-`ADMIN`, then:

- already `CANCELLED` → **400**;
- in one transaction: seats back to `AVAILABLE` with `lockedUntil: null`, any
  `ACTIVE` ticket → `CANCELLED`, and booking status → `CANCELLED`.

## Statuses

`ShowSeatStatus` — `AVAILABLE` → `LOCKED` → `BOOKED`, and back to `AVAILABLE` on
unlock or cancel.

`BookingStatus` — the enum has `PENDING`, `CONFIRMED`, `FAILED`, `CANCELLED`,
`REFUNDED`, `EXPIRED`, but today the flow only ever writes **`CONFIRMED`** (on
create) and **`CANCELLED`** (on cancel). The rest are reserved for the payment
step.

## Lock expiry: two sources of truth

A hold lives in two places, and they expire differently:

| | Expires how | Used for |
|---|---|---|
| Redis `seatlock:<showId>:<showSeatId>` | Automatically, via 120s `PX` TTL | The authoritative check on `confirm` |
| `ShowSeat.status = LOCKED` + `lockedUntil` | Never — nothing rewrites the row | Display, so the seat map can grey the seat out |

Nothing sweeps stale `LOCKED` rows, so the reconciliation is `getSeatMap`'s lazy
expiry: `LOCKED && lockedUntil < now` is *presented* as `AVAILABLE`. The row
itself is corrected the next time someone locks that seat (the `lockSeats`
`updateMany` only excludes `BOOKED`, so a stale `LOCKED` row is freely
overwritten by the new holder).

## Error reference

| Code | When |
|------|------|
| 400 | Show is not `SCHEDULED`; booking already cancelled; ticketing a booking that isn't `CONFIRMED`; DTO validation (missing `showId`, empty array, >10 seats, duplicates) |
| 401 | No / invalid JWT |
| 403 | Reading someone else's booking without `ADMIN` |
| 404 | Show not found; a `showSeatId` doesn't belong to the show; booking not found; no ticket issued yet for the booking |
| 409 | Seat already `BOOKED`; seat held by another user; hold expired at confirm; seat taken mid-transaction |

`SeatSelectionDto` caps a selection at **10 seats**, requires **at least 1**, and
rejects duplicate ids. `ValidationPipe` runs with `whitelist` +
`forbidNonWhitelisted`, so unknown body fields are a 400.

## Ticket statuses

`TicketStatus` — `ACTIVE` on issue, `CANCELLED` when the booking is cancelled.
`USED` and `EXPIRED` (and the `usedAt` column) exist for the gate scan, which
isn't built yet: scanning will look the `ticketCode` up, require `ACTIVE`, then
set `USED` + `usedAt` so the same QR can't be reused.

## Not implemented yet

Worth knowing before you build on this:

- **No payment.** The `Payment` model exists in the schema but no payment module
  does. `confirm` writes `CONFIRMED` directly, so the 2-minute hold is currently
  a selection window, not a payment window. Adding payments means an
  intermediate `PENDING` booking and a provider webhook that promotes it to
  `CONFIRMED` or `FAILED`/`EXPIRED`.
- **No expiry job.** No cron/scheduler releases stale `LOCKED` rows or expires
  abandoned bookings — only the lazy expiry described above.
- **`version` is incremented but never read.** The `ShowSeat.version` column is
  bumped on booking; the actual concurrency protection comes from the Redis Lua
  lock plus the `status != BOOKED` guard on `updateMany`, not from optimistic
  version checks.
- **Cancel has no policy.** Any non-cancelled booking can be cancelled at any
  time — no cutoff relative to show start, no refund handling.
- **Redis is required.** If Redis is down, `lock` and `confirm` fail. There's no
  DB-only fallback path.
- **No QR rendering and no gate scan.** The `ticketCode` exists and is the
  credential; nothing yet turns it into a QR image or validates a scan
  (`USED`/`usedAt` are never written). That's a separate module, deliberately
  kept out of ticket-code generation.
