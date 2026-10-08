# Booking Platform — Frontend Integration Guide

Everything the frontend team needs to integrate against the APIs: the auth flow,
every endpoint with request/response shapes, all enums, and a full inventory of
the seeded dummy data (with example IDs/slugs you can hit directly).

- **Base URL (local):** `http://localhost:3000`
- **Base URL (deployed):** `https://34-131-36-123.nip.io`
- **No global route prefix** — routes are mounted at the root (e.g. `GET /movies`).
- **Content type:** `application/json`
- **Validation:** strict. Unknown body fields are rejected (`400`), types are
  coerced where sensible. Send exactly the documented fields.

### Response envelope (every endpoint)

Every response — success **and** error — is wrapped in the same structure:

```json
{ "code": 200, "data": <payload | null>, "message": "human-readable status" }
```

- `code` — the HTTP status (`200`, `201`, `404`, …).
- `data` — the actual payload (object, array, or `null`). **Read your result from `data`.**
- `message` — a short per-endpoint message (e.g. `"Showtimes fetched"`).

On errors, `data` is `null` and `message` holds the reason. The only routes **not**
wrapped are the OAuth browser redirects (`GET /auth/google`, `GET /auth/google/callback`),
which redirect instead of returning JSON.

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

## 1b. End-to-end flow — the discovery chain

The frontend **never hardcodes or guesses an ID** (`movieId`, `showId`, `showSeatId`).
It **discovers** them by walking the browse chain: each screen's API response hands
the frontend the IDs it needs for the next call. You just carry an ID forward from
one response into the URL/body of the next request.

```
GET /movies                       → movieId
GET /movies/:movieId/showtimes    → showId      (attached to each time slot)
GET /shows/:showId/seats          → showSeatId[]
POST /bookings/lock  { showId, showSeatIds }     (login required)
POST /bookings       { showId, showSeatIds }     (login required)
```

### 1. Home / movie list → get a `movieId`
```bash
curl https://34-131-36-123.nip.io/movies
# data: [ { "id": "mov_123", "title": "...", ... } ]
```
(Carousel banner: `GET /movies/carousel` for the top 3 recommended.)
User taps a movie → the frontend now holds **`movieId = "mov_123"`**.

### 2. Showtimes screen → get the `showId`
```bash
curl "https://34-131-36-123.nip.io/movies/mov_123/showtimes?cityId=cty_9&date=2026-07-20"
```
This returns `venues`, and inside each venue a list of `shows` — **each show carries
its own `showId`**:
```json
{
  "data": {
    "movie": { "id": "mov_123", "title": "..." },
    "venues": [
      {
        "venue": { "id": "ven_5", "name": "INOX R-City" },
        "shows": [
          { "showId": "shw_777", "startTime": "2026-07-20T13:30:00Z", "screenName": "Screen 1", "availableSeats": 92 },
          { "showId": "shw_778", "startTime": "2026-07-20T18:00:00Z", "screenName": "Screen 1", "availableSeats": 40 }
        ]
      }
    ]
  }
}
```
The user sees a grid of **time buttons** (13:30, 18:00…) under each cinema. Each
button is backed by a `showId`. When the user taps **"18:00 at INOX R-City"**, the
frontend already holds **`showId = "shw_778"`** — it doesn't compute it, it just
reads it from the button it rendered.

**Factors that change what comes back:** `cityId` (only that city's cinemas),
`date` (only that day; omit for all upcoming), and the server always drops **past**
and **non-`SCHEDULED`** shows. `availableSeats` lets you grey out near-full slots.

### 3. Seat map → use that `showId`
```bash
curl https://34-131-36-123.nip.io/shows/shw_778/seats
```
Returns every seat with its `status` (`AVAILABLE`/`LOCKED`/`BOOKED`), `category`,
`price`, and **`showSeatId`**. User picks 1–10 `AVAILABLE` seats → the frontend
collects those **`showSeatId`s** for the next step.

### 4. Lock, then confirm (login required) → get a booking
```bash
# Hold the chosen seats for ~2 minutes (all-or-nothing)
curl -X POST https://34-131-36-123.nip.io/bookings/lock \
  -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{ "showId": "shw_778", "showSeatIds": ["ss_1", "ss_2"] }'

# Collect payment, then confirm within the 2-minute window
curl -X POST https://34-131-36-123.nip.io/bookings \
  -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{ "showId": "shw_778", "showSeatIds": ["ss_1", "ss_2"] }'
```
`409` on lock means someone grabbed a seat first → re-fetch the seat map (step 3).
Confirm must land inside the 2-minute hold, or the seats free up and the user restarts.

> **Auth timing:** steps 1–3 are fully public (browsing). The **login gate is at
> step 4** — only when the user commits to locking seats do you need the Google
> OAuth token (send them through `GET /auth/google`; see §1).

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
| GET    | `/movies`               | public | Filters: `?q=` (title), `?language=`, `?genre=` |
| GET    | `/movies/carousel`      | public | **Top 3 recommended** movies for the home carousel (rating desc, then newest) |
| GET    | `/movies/recommended`   | public | All movies flagged `isRecommended` (newest first) |
| GET    | `/movies/:id/showtimes` | public | Movie's upcoming shows **grouped by cinema**; filters: `?cityId=`, `?date=YYYY-MM-DD` |
| GET    | `/movies/slug/:slug`    | public | e.g. `/movies/slug/neon-bazaar` |
| GET    | `/movies/:id`           | public | |
| POST   | `/movies`               | bearer | see below |
| PATCH  | `/movies/:id`           | bearer | partial |
| DELETE | `/movies/:id`           | bearer | 204 |

**Create body:** `{ title, description, language, durationMin, releaseDate (ISO date), genre: string[], slug?, posterUrl?, rating? (0–10), isRecommended? (bool) }`

**Carousel / recommended response** (`data` is a `Movie[]`):
```json
{ "code": 200, "message": "Carousel movies fetched", "data": [ /* up to 3 Movie objects */ ] }
```

**Showtimes response** (`GET /movies/:id/showtimes`) — drives the "pick a cinema & time" screen:
```json
{
  "code": 200,
  "message": "Showtimes fetched",
  "data": {
    "movie": { "id": "clx...", "title": "Neon Bazaar", "posterUrl": "...", "durationMin": 137 },
    "venues": [
      {
        "venue": { "id": "clx...", "name": "INOX R-City", "address": "...",
                   "city": { "id": "clx...", "name": "Mumbai", "slug": "mumbai" } },
        "shows": [
          { "showId": "clx...", "startTime": "2026-07-20T13:30:00.000Z",
            "endTime": "2026-07-20T15:58:00.000Z", "basePrice": "250",
            "screenId": "clx...", "screenName": "Screen 1", "availableSeats": 92 }
        ]
      }
    ]
  }
}
```
- Only **upcoming** (`startTime ≥ now`), **SCHEDULED** shows are returned.
- `shows` are ordered by `startTime`; `venues` is `[]` if nothing matches.
- `date` is interpreted in **UTC** (`YYYY-MM-DDT00:00:00Z` .. +24h).
- `availableSeats` counts `AVAILABLE` show-seats (exact live map is `GET /shows/:id/seats`).

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

### Cities (12)
`delhi`, `mumbai`, `bangalore`, `hyderabad`, `chennai`, `pune`, `kolkata`,
`ahmedabad`, `jaipur`, `lucknow`, `chandigarh`, `kochi`

Every city has at least one venue.

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

### Venues (12) — one per city, 2 screens each
| Venue | Slug | City | Owner |
|-------|------|------|-------|
| PVR Select Citywalk     | `pvr-select-citywalk-delhi`        | Delhi      | Ravi Menon |
| INOX R-City             | `inox-rcity-mumbai`                | Mumbai     | Priya Sharma |
| Cinepolis Forum Mall    | `cinepolis-forum-bangalore`        | Bangalore  | Arjun Reddy |
| PVR Inorbit             | `pvr-inorbit-hyderabad`            | Hyderabad  | Ravi Menon |
| INOX Phoenix Marketcity | `inox-phoenix-pune`                | Pune       | Priya Sharma |
| Cinepolis Express Avenue| `cinepolis-express-avenue-chennai` | Chennai    | Arjun Reddy |
| INOX South City         | `inox-south-city-kolkata`          | Kolkata    | Priya Sharma |
| PVR Acropolis           | `pvr-acropolis-ahmedabad`          | Ahmedabad  | Ravi Menon |
| Cinepolis WTP           | `cinepolis-wtp-jaipur`             | Jaipur     | Arjun Reddy |
| INOX Riverside          | `inox-riverside-lucknow`           | Lucknow    | Priya Sharma |
| PVR Elante              | `pvr-elante-chandigarh`            | Chandigarh | Ravi Menon |
| Cinepolis Lulu Mall     | `cinepolis-lulu-kochi`             | Kochi      | Arjun Reddy |

### Screens & seats
- **24 screens** total (2 per venue), each named `Screen 1` / `Screen 2`.
- **96 seats per screen** (rows A–H × 12), **2,304 seats** total.
- Seat categories per row:
  - **A–D** → `REGULAR`
  - **E–F** → `PREMIUM` (×1.5 price)
  - **G–H** → `RECLINER` (×2 price)

### Shows & show-seats
- Generated for **today + the next 3 days** (always upcoming relative to seed run).
- **4 showtimes/day** per screen: **10:00, 13:00, 17:00, 21:00**.
- ⇒ **384 shows** (24 screens × 4 days × 4 slots), each `SCHEDULED`.
- Each show materializes 96 `ShowSeat`s ⇒ **36,864 show-seats**.
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

# 3. Showtimes for a movie, grouped by cinema (grab a movieId from step 2)
#    → each venue's shows[] carry the showId you need next
curl "http://localhost:3000/movies/<MOVIE_ID>/showtimes?cityId=<CITY_ID>"

# 4. Get the seat map for a show (grab a showId from step 3)
curl http://localhost:3000/shows/<SHOW_ID>/seats

# 5. (authed) Lock seats, then confirm
curl -X POST http://localhost:3000/bookings/lock \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "showId": "<SHOW_ID>", "showSeatIds": ["<ID1>", "<ID2>"] }'
```

---

### Error format
Errors use the same envelope as success responses (`data` is `null`):
```json
{ "code": 400, "data": null, "message": "field must be a string" }
```
Common codes: `400` validation, `401` missing/invalid token, `403` forbidden,
`404` not found, `409` conflict (e.g. seat already locked/booked).
