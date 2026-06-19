# Booking Platform — Frontend Integration Guide

Everything the frontend team needs to integrate against the APIs: the auth flow,
every endpoint with request/response shapes, all enums, and a full inventory of
the seeded dummy data (with example IDs/slugs you can hit directly).

- **Base URL (local):** `http://localhost:3000`
- **No global route prefix** — routes are mounted at the root (e.g. `GET /movies`).
- **Content type:** `application/json`
- **Validation:** strict. Unknown body fields are rejected (`400`), types are
  coerced where sensible. Send exactly the documented fields.

---

## 1. Authentication

Auth is **Google OAuth → JWT access token + opaque refresh token**.

### Flow
1. Frontend sends the user to **`GET /auth/google`** (full-page redirect, not fetch).
2. After Google consent, the backend redirects to
   `FRONTEND_URL` (default `http://localhost:5173/auth/callback`) with tokens in
   the query string:
   `…/auth/callback?accessToken=<JWT>&refreshToken=<opaque>`
3. Frontend reads both tokens from the URL and stores them (access token in
   memory, refresh token in secure storage).
4. Send the access token on every protected call:
   `Authorization: Bearer <accessToken>`

### Token lifetimes
- Access token (JWT): **15 minutes** (`ACCESS_TOKEN_TTL`)
- Refresh token: **30 days** (`REFRESH_TOKEN_TTL_DAYS`), single-use / rotating.

### Endpoints

| Method | Path                   | Auth        | Body                          | Purpose |
|--------|------------------------|-------------|-------------------------------|---------|
| GET    | `/auth/google`         | public      | —                             | Start Google OAuth (redirect) |
| GET    | `/auth/google/callback`| public      | —                             | OAuth callback → redirects to frontend with tokens |
| POST   | `/auth/refresh`        | public      | `{ refreshToken }`            | Exchange refresh token for a new token pair |
| POST   | `/auth/logout`         | **bearer**  | `{ refreshToken }`            | Revoke the refresh token (204) |
| GET    | `/auth/me`             | **bearer**  | —                             | Current user profile |

`refreshToken` must be a string ≥ 32 chars.

**`GET /auth/me` response:**
```json
{
  "id": "clx...",
  "email": "aditya@example.com",
  "name": "Aditya Kumar",
  "avatarUrl": "https://i.pravatar.cc/150?u=aditya",
  "phone": "+919811111111",
  "role": "USER",
  "createdAt": "2026-06-19T...",
  "updatedAt": "2026-06-19T..."
}
```

**`POST /auth/refresh` response:** `{ "accessToken": "...", "refreshToken": "..." }`

> ⚠️ Seeded users have no real Google credentials — you can't log in as them via
> Google. For protected endpoints during integration, log in with your own
> Google account (you'll be created as a `USER`), or have backend mint a token
> for a seeded user. The seeded customers exist so that "my bookings" and booked
> seats show realistic data.

---

## 2. Enums (use these exact string values)

| Enum | Values |
|------|--------|
| `UserRole` | `USER`, `THEATRE_OWNER`, `ADMIN` |
| `SeatCategory` | `REGULAR`, `PREMIUM`, `RECLINER` |
| `ShowStatus` | `SCHEDULED`, `CANCELLED`, `HOUSEFULL`, `COMPLETED` |
| `ShowSeatStatus` | `AVAILABLE`, `LOCKED`, `BOOKED` |
| `BookingStatus` | `PENDING`, `CONFIRMED`, `FAILED`, `CANCELLED`, `REFUNDED`, `EXPIRED` |
| `PaymentProvider` | `RAZORPAY`, `STRIPE` |
| `PaymentStatus` | `INITIATED`, `PROCESSING`, `SUCCESS`, `FAILED`, `CANCELLED`, `REFUNDED` |

`Decimal` money fields (prices, amounts) serialize as **strings** in JSON
(e.g. `"270.00"`). Parse before doing math.

---

## 3. Resource APIs

> Write endpoints (`POST` / `PATCH` / `DELETE`) require a bearer token. The `GET`
> (read) endpoints listed as **public** need no auth — ideal for building the
> browse/discovery UI.

### 3.1 Cities — `/cities`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET    | `/cities`            | public | All cities |
| GET    | `/cities/slug/:slug` | public | e.g. `/cities/slug/mumbai` |
| GET    | `/cities/:id`        | public | |
| POST   | `/cities`            | bearer | `{ name, state, slug? }` |
| PATCH  | `/cities/:id`        | bearer | partial |
| DELETE | `/cities/:id`        | bearer | 204 |

**City shape:**
```json
{ "id": "clx...", "name": "Mumbai", "state": "Maharashtra", "slug": "mumbai",
  "createdAt": "...", "updatedAt": "..." }
```

### 3.2 Venues (theatres) — `/venues`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET    | `/venues`            | public | Filters: `?cityId=`, `?ownerId=`, `?q=` (name search) |
| GET    | `/venues/slug/:slug` | public | |
| GET    | `/venues/:id`        | public | |
| POST   | `/venues`            | bearer | `{ name, address, cityId, ownerId, slug?, lat?, lng? }` |
| PATCH  | `/venues/:id`        | bearer | partial |
| DELETE | `/venues/:id`        | bearer | 204 |

**Venue shape:** `id, name, slug, address, lat, lng, cityId, ownerId, createdAt, updatedAt`
(detail/list responses typically include the related `city`).

### 3.3 Screens — `/screens`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET    | `/screens`     | public | Filter: `?venueId=` |
| GET    | `/screens/:id` | public | |
| POST   | `/screens`     | bearer | `{ name, totalSeats, venueId }` |
| PATCH  | `/screens/:id` | bearer | partial |
| DELETE | `/screens/:id` | bearer | 204 |

**Screen shape:** `id, name, totalSeats, venueId, createdAt, updatedAt`

### 3.4 Seats (physical seats of a screen) — `/seats`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET    | `/seats`      | public | Filters: `?screenId=`, `?category=` |
| GET    | `/seats/:id`  | public | |
| POST   | `/seats`      | bearer | `{ row, number, category?, screenId }` |
| POST   | `/seats/bulk` | bearer | `{ screenId, seats: [{ row, number, category? }] }` (1–2000) |
| PATCH  | `/seats/:id`  | bearer | partial |
| DELETE | `/seats/:id`  | bearer | 204 |

- `row` = 1–2 uppercase letters (`"A"`, `"AA"`). `number` = 1–1000.
- `category` defaults to `REGULAR`.

**Seat shape:** `id, row, number, category, screenId, createdAt, updatedAt`

### 3.5 Movies — `/movies`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET    | `/movies`            | public | Filters: `?q=` (title), `?language=`, `?genre=` |
| GET    | `/movies/slug/:slug` | public | e.g. `/movies/slug/neon-bazaar` |
| GET    | `/movies/:id`        | public | |
| POST   | `/movies`            | bearer | see below |
| PATCH  | `/movies/:id`        | bearer | partial |
| DELETE | `/movies/:id`        | bearer | 204 |

**Create body:** `{ title, description, language, durationMin, releaseDate (ISO date), genre: string[], slug?, posterUrl?, rating? (0–10) }`

**Movie shape:**
```json
{
  "id": "clx...",
  "title": "Neon Bazaar",
  "slug": "neon-bazaar",
  "description": "...",
  "language": "Hindi",
  "durationMin": 137,
  "releaseDate": "2026-06-05T00:00:00.000Z",
  "posterUrl": "https://image.tmdb.org/t/p/w500/neon-bazaar.jpg",
  "rating": 7.6,
  "genre": ["Action", "Crime", "Thriller"],
  "createdAt": "...", "updatedAt": "..."
}
```

### 3.6 Shows — `/shows`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET    | `/shows`         | public | Filters: `?movieId=`, `?screenId=`, `?status=`, `?from=`, `?to=` (ISO datetimes) |
| GET    | `/shows/:id`     | public | Includes `movie` + `screen` |
| GET    | `/shows/:id/seats` | public | **Seat map** (see below) |
| POST   | `/shows`         | bearer | `{ movieId, screenId, startTime, basePrice, endTime?, status? }` |
| PATCH  | `/shows/:id`     | bearer | partial |
| DELETE | `/shows/:id`     | bearer | 204 |

- `endTime` is optional; if omitted it's computed from `startTime + movie.durationMin`.
- Creating a show auto-generates one `ShowSeat` per physical seat, priced as
  `basePrice × categoryMultiplier`.
- **Category multipliers:** `REGULAR ×1`, `PREMIUM ×1.5`, `RECLINER ×2`.

**Seat-map response (`GET /shows/:id/seats`)** — this drives the seat-selection UI:
```json
[
  {
    "showSeatId": "clx...",   // <-- use THIS id when locking/booking
    "seatId": "clx...",
    "row": "A",
    "number": 1,
    "category": "REGULAR",
    "price": "180.00",
    "status": "AVAILABLE",     // AVAILABLE | LOCKED | BOOKED
    "lockedUntil": null         // ISO timestamp when LOCKED, else null
  }
]
```
Seats are returned sorted by row then number. Expired locks are reported as
`AVAILABLE` automatically.

---

## 4. Booking flow — `/bookings` (all require bearer)

The booking flow is **lock → confirm**, with a 2-minute hold.

| Method | Path | Body | Purpose |
|--------|------|------|---------|
| POST   | `/bookings/lock`   | `{ showId, showSeatIds: string[] }` | Hold seats for ~2 min |
| POST   | `/bookings/unlock` | `{ showId, showSeatIds: string[] }` | Release a hold early |
| POST   | `/bookings`        | `{ showId, showSeatIds: string[] }` | Confirm held seats → booking |
| GET    | `/bookings`        | —                                   | Current user's bookings |
| GET    | `/bookings/:id`    | —                                   | One booking (owner/admin can view others) |
| POST   | `/bookings/:id/cancel` | —                               | Cancel a booking |

- `showSeatIds` = 1–10 unique `showSeatId` values from the seat map.
- Typical UX: select seats → `POST /bookings/lock` → collect payment →
  `POST /bookings` to confirm within the 2-minute window.

**Booking shape (with seats):**
```json
{
  "id": "clx...",
  "status": "CONFIRMED",
  "totalAmount": "360.00",
  "userId": "clx...",
  "showId": "clx...",
  "createdAt": "...",
  "seats": [
    { "id": "clx...", "seatRow": "A", "seatNumber": 1,
      "seatCategory": "REGULAR", "price": "180.00", "showSeatId": "clx..." }
  ]
}
```

---

## 5. Seeded dummy data inventory

Run `npm run seed` to (re)populate. The seed **wipes** all transactional data
(users, venues, screens, seats, movies, shows, show-seats, bookings, payments,
refresh tokens) and recreates it; cities are upserted (kept).

> ℹ️ IDs are `cuid`s generated at seed time — fetch real IDs via the list
> endpoints. **Slugs are stable** and safe to hard-code in test UIs.

### Cities (7)
`delhi`, `mumbai`, `bangalore`, `hyderabad`, `chennai`, `pune`, `kolkata`

### Users (7)
| Name | Email | Role |
|------|-------|------|
| Ravi Menon     | `owner.pvr@knot.dating`       | THEATRE_OWNER |
| Priya Sharma   | `owner.inox@knot.dating`      | THEATRE_OWNER |
| Arjun Reddy    | `owner.cinepolis@knot.dating` | THEATRE_OWNER |
| Platform Admin | `admin@knot.dating`           | ADMIN |
| Aditya Kumar   | `aditya@example.com`          | USER |
| Sneha Iyer     | `sneha@example.com`           | USER |
| Mohit Verma    | `mohit@example.com`           | USER |

### Movies (8)
| Title | Slug | Language | Duration | Rating | Genres |
|-------|------|----------|----------|--------|--------|
| Echoes of Tomorrow | `echoes-of-tomorrow` | English   | 142m | 8.4 | Sci-Fi, Thriller, Drama |
| The Last Monsoon   | `the-last-monsoon`   | Malayalam | 128m | 8.9 | Romance, Drama |
| Neon Bazaar        | `neon-bazaar`        | Hindi     | 137m | 7.6 | Action, Crime, Thriller |
| Paper Boats        | `paper-boats`        | Hindi     | 119m | 8.1 | Drama, Comedy |
| Quantum Heist      | `quantum-heist`      | English   | 151m | 7.9 | Action, Sci-Fi, Heist |
| Mango Summer       | `mango-summer`       | Telugu    | 124m | 7.4 | Comedy, Family |
| Silent Frequency   | `silent-frequency`   | Tamil     | 133m | 8.2 | Thriller, Mystery |
| Starlight Express  | `starlight-express`  | English   |  98m | 7.1 | Animation, Musical, Family |

### Venues (5) — 2 screens each
| Venue | Slug | City | Owner |
|-------|------|------|-------|
| PVR Select Citywalk     | `pvr-select-citywalk-delhi` | Delhi     | Ravi Menon |
| INOX R-City             | `inox-rcity-mumbai`         | Mumbai    | Priya Sharma |
| Cinepolis Forum Mall    | `cinepolis-forum-bangalore` | Bangalore | Arjun Reddy |
| PVR Inorbit             | `pvr-inorbit-hyderabad`     | Hyderabad | Ravi Menon |
| INOX Phoenix Marketcity | `inox-phoenix-pune`         | Pune      | Priya Sharma |

### Screens & seats
- **10 screens** total (2 per venue), each named `Screen 1` / `Screen 2`.
- **96 seats per screen** (rows A–H × 12), **960 seats** total.
- Seat categories per row:
  - **A–D** → `REGULAR`
  - **E–F** → `PREMIUM` (×1.5 price)
  - **G–H** → `RECLINER` (×2 price)

### Shows & show-seats
- Generated for **today + the next 3 days** (always upcoming relative to seed run).
- **4 showtimes/day** per screen: **10:00, 13:00, 17:00, 21:00**.
- ⇒ **160 shows** (10 screens × 4 days × 4 slots), each `SCHEDULED`.
- Each show materializes 96 `ShowSeat`s ⇒ **~15,360 show-seats**.
- `basePrice` rotates through **₹180 / ₹220 / ₹250 / ₹300**.
  - Example pricing at base ₹200: REGULAR ₹200, PREMIUM ₹300, RECLINER ₹400.
- Movies rotate across screens/days so every screen has a varied lineup.

### Sample bookings (3)
- One **CONFIRMED** booking each for Aditya, Sneha, and Mohit.
- Each books **2 seats** on an upcoming show, with a **SUCCESS** payment
  (Razorpay / Stripe alternating).
- Those seats show as `BOOKED` in the corresponding seat map — good for testing
  the "seat already taken" UI and the "My Bookings" screen.

---

## 6. Quick start for the frontend

```bash
# 1. Browse cities
curl http://localhost:3000/cities

# 2. Browse movies (or filter)
curl "http://localhost:3000/movies?language=Hindi"
curl http://localhost:3000/movies/slug/neon-bazaar

# 3. Find shows for a movie (grab a movieId from step 2)
curl "http://localhost:3000/shows?movieId=<MOVIE_ID>"

# 4. Get the seat map for a show
curl http://localhost:3000/shows/<SHOW_ID>/seats

# 5. (authed) Lock seats, then confirm
curl -X POST http://localhost:3000/bookings/lock \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "showId": "<SHOW_ID>", "showSeatIds": ["<ID1>", "<ID2>"] }'
```

---

### Error format
Standard NestJS errors:
```json
{ "statusCode": 400, "message": ["field must be a string"], "error": "Bad Request" }
```
Common codes: `400` validation, `401` missing/invalid token, `403` forbidden,
`404` not found, `409` conflict (e.g. seat already locked/booked).
