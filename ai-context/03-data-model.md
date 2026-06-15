# 03 — Data Model

Source of truth: [`prisma/schema.prisma`](../prisma/schema.prisma).
Migration: `prisma/migrations/20260524131810_init`. Provider: PostgreSQL.
All primary keys are **cuid** strings.

## Entity relationships

```
User ──< Booking >── Show ──> Movie
  │                    │
  │ (VenueOwner)       └──> Screen ──> Venue ──> City
  └──< Venue           │        │
                       │        └──< Seat
RefreshToken >── User  │
                       └──< ShowSeat ──> Seat
Show ──< ShowSeat ──── BookingSeat >── Booking
Booking ──1:1── Payment
```

## Enums

| Enum | Values |
|------|--------|
| `UserRole` | USER, THEATRE_OWNER, ADMIN |
| `SeatCategory` | REGULAR, PREMIUM, RECLINER |
| `BookingStatus` | PENDING, CONFIRMED, FAILED, CANCELLED, REFUNDED, EXPIRED |
| `PaymentProvider` | RAZORPAY, STRIPE |
| `PaymentStatus` | INITIATED, PROCESSING, SUCCESS, FAILED, CANCELLED, REFUNDED |
| `ShowStatus` | SCHEDULED, CANCELLED, HOUSEFULL, COMPLETED |
| `ShowSeatStatus` | AVAILABLE, LOCKED, BOOKED |

## Models

### User
`id, email (unique), googleId (unique), name, avatarUrl?, phone?, role=USER`.
Relations: `bookings`, `ownedVenues` (relation "VenueOwner"), `refreshTokens`.
Auth-only — created via Google OAuth upsert; no password.

### City
`id, name, state, slug (unique)`. Relation: `venues`. Seeded with 7 Indian cities.

### Venue (theatre)
`id, name, slug (unique), address, lat?, lng?, cityId, ownerId`.
Belongs to a `City` and an owner `User`. Has many `Screen`.
Indexed on `cityId`, `ownerId`.

### Screen
`id, name, totalSeats, venueId`. Has many `Seat` and `Show`. Indexed on `venueId`.

### Seat (physical)
`id, row, number, category=REGULAR, screenId`.
Unique `(screenId, row, number)`. Has many `ShowSeat` (one per show).

### Movie
`id, title, slug (unique), description, language, durationMin, releaseDate,
posterUrl?, rating?, genre String[]`. Has many `Show`.

### Show (a screening)
`id, startTime, endTime, status=SCHEDULED, basePrice Decimal(10,2), movieId, screenId`.
Has many `Booking` and `ShowSeat`.
Indexed on `(movieId, startTime)`, `(screenId, startTime)`, `status`.

### ShowSeat ⭐ (core booking primitive)
Real-time bookable state of one seat for one show.
`id, showId, seatId, status=AVAILABLE, lockedUntil?, version=0, price Decimal(10,2)`.
- `version` → **optimistic locking** for concurrent booking attempts.
- `lockedUntil` → **time-bounded seat hold** during checkout.
- `price` → **per-seat dynamic pricing** (overrides show basePrice).
Unique `(showId, seatId)`. Indexed on `(showId, status)`, `lockedUntil`.
Relation: optional `bookingSeat`.

### Booking
`id, status=PENDING, totalAmount Decimal(10,2), userId, showId`.
Has many `BookingSeat`, optional `payment`. Indexed on `userId`, `showId`, `status`.

### BookingSeat (snapshot)
`id, bookingId, showSeatId (unique), seatRow, seatNumber, seatCategory, price`.
Denormalised snapshot of a booked seat so historical bookings stay accurate even
if seats/prices change. `onDelete: Cascade` from Booking.

### Payment
`id, provider, providerOrderId (unique), idempotencyKey? (unique), amount,
status=INITIATED, paidAt?, bookingId (unique 1:1)`. Indexed on `status`.

### RefreshToken
`id, tokenHash (unique, SHA-256), expiresAt, revokedAt?, userId`.
Rotation-based sessions; `onDelete: Cascade` from User. Indexed on `userId`, `expiresAt`.

## Design notes for AI

- **Money** is always `Decimal(10,2)` — never use JS floats for amounts.
- **Snapshots** (BookingSeat) intentionally duplicate data — don't "normalise" them away.
- **Concurrency** is meant to be handled at the `ShowSeat` level (version + lockedUntil),
  potentially backed by Redis locks. Any booking implementation MUST respect this.
- Schema header comment mentions "Supabase Auth" but the actual implementation uses
  Google OAuth + custom JWT/refresh tokens (no Supabase code present).
