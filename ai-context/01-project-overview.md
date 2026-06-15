# 01 — Project Overview

## What this is

A **movie ticket booking platform** backend, modelled on BookMyShow. Users browse
movies and shows across cities/venues, pick seats, and pay. Theatre owners manage
their venues, screens, and showtimes.

This repository is the **API/backend only** (NestJS). No frontend lives here; the
auth flow redirects to a `FRONTEND_URL` after Google login (a separate SPA is
assumed, e.g. running on `http://localhost:5173`).

## Goals / design intent

The schema and code are written to be **production-grade**, not a toy:

- **Real seat-booking semantics** — seat state is tracked per show, with optimistic
  locking (`version`) and time-bounded locks (`lockedUntil`) to handle concurrent
  bookings and prevent double-booking.
- **Payment-ready** — `Payment` model supports Razorpay/Stripe, idempotency keys,
  and a full status lifecycle.
- **Multi-tenant by role** — `USER`, `THEATRE_OWNER`, `ADMIN`. Owners own venues.
- **Session security** — rotation-based refresh tokens (SHA-256 hashed, multi-device).

## Domain glossary

| Term | Meaning |
|------|---------|
| **City** | A geographic market (Delhi, Mumbai, …). Top-level browse filter. |
| **Venue** | A physical theatre/cinema, belongs to a City and an owner (User). |
| **Screen** | An auditorium inside a Venue. Has physical Seats. |
| **Seat** | A physical seat in a Screen (row + number + category). |
| **Movie** | A film with metadata (language, duration, genre, rating, poster). |
| **Show** | A screening = Movie × Screen × time window, with a base price. |
| **ShowSeat** | The bookable state of one Seat for one Show (available/locked/booked, price). |
| **Booking** | A user's reservation for one or more ShowSeats in a Show. |
| **BookingSeat** | A snapshot of one booked seat (denormalised row/number/category/price). |
| **Payment** | The payment record tied 1:1 to a Booking. |

## Booking flow (intended)

1. User browses Cities → Venues → Shows for a Movie.
2. User selects ShowSeats → they get **LOCKED** (`lockedUntil` set) so others can't grab them.
3. A `Booking` (PENDING) + `Payment` (INITIATED) is created.
4. On successful payment → ShowSeats become **BOOKED**, Booking **CONFIRMED**.
5. On timeout/failure → locks expire, seats return to **AVAILABLE**, Booking **EXPIRED/FAILED**.

> ⚠️ As of now, only browse-side primitives (City, Venue) and auth exist.
> Seat-locking, booking, and payment logic are **not yet implemented** — see
> [`05-progress-and-roadmap.md`](./05-progress-and-roadmap.md).
