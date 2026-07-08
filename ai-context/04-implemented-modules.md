# 04 — Implemented Modules & API

Three feature modules exist today: **auth**, **city**, **venue**.
All routes require a JWT unless marked **Public**.

## Auth (`src/modules/auth`)

Google OAuth login + JWT access tokens + rotating refresh tokens.

| Method | Route | Access | Description |
|--------|-------|--------|-------------|
| GET | `/auth/google` | Public | Redirect to Google consent screen |
| GET | `/auth/google/callback` | Public | OAuth callback → upsert user, issue tokens, redirect to `FRONTEND_URL?accessToken&refreshToken` |
| POST | `/auth/refresh` | Public | Body `{ refreshToken }` → rotate & return new token pair |
| POST | `/auth/logout` | Authed | Body `{ refreshToken }` → revoke that refresh token (204) |
| GET | `/auth/me` | Authed | Current user profile |

Key pieces:
- `auth.service.ts` — `loginWithGoogle`, `refresh` (rotation), `logout`, `getMe`,
  `issueTokenPair` (JWT + hashed refresh token), `hashToken` (SHA-256).
- `strategies/google.strategy.ts` — maps Google profile → `GoogleProfilePayload`.
- `strategies/jwt.strategy.ts` — verifies JWT, re-checks user exists in DB, returns `AuthUser`.
- `guards/jwt-auth.guard.ts` — **registered globally**; honors `@Public()`.
- `decorators/public.decorator.ts` — `@Public()` marks a route as unauthenticated.
- `decorators/current-user.decorator.ts` — `@CurrentUser()` → `AuthUser { id, email, role }`.

## City (`src/modules/city`)

CRUD for cities. Auto-slugifies name if no slug given. Maps Prisma `P2002` → 409.

| Method | Route | Access | Description |
|--------|-------|--------|-------------|
| POST | `/cities` | Authed | Create city `{ name, state, slug? }` |
| GET | `/cities` | Public | List all (sorted by name) |
| GET | `/cities/slug/:slug` | Public | Get by slug |
| GET | `/cities/:id` | Public | Get by id |
| PATCH | `/cities/:id` | Authed | Update |
| DELETE | `/cities/:id` | Authed | Delete (204) |

## Venue (`src/modules/venue`)

CRUD for venues with validation that the city exists and the owner has role
`THEATRE_OWNER` or `ADMIN`. Auto-slugifies. Filterable list.

| Method | Route | Access | Description |
|--------|-------|--------|-------------|
| POST | `/venues` | Authed | Create `{ name, slug?, address, lat?, lng?, cityId, ownerId }` |
| GET | `/venues` | Public | List, filters: `?cityId=&ownerId=&q=` (name search) |
| GET | `/venues/slug/:slug` | Public | Get by slug (includes city) |
| GET | `/venues/:id` | Public | Get by id (includes city) |
| PATCH | `/venues/:id` | Authed | Update |
| DELETE | `/venues/:id` | Authed | Delete; 409 if screens attached (`P2003`) |

Validation helpers in `venue.service.ts`: `assertCityExists`, `assertOwnerEligible`.

## Notes / caveats for AI

- **Write routes are authed but not role-gated.** Any logged-in user can create
  cities/venues. `ownerId` is passed in the body and validated for role, but the
  caller isn't checked against it — there's no "is this my venue" ownership guard yet.
- City/Venue both define a private `slugify()` (duplicated) — candidate for a shared util.
- `City` model has no `@@index`; lookups are by unique `slug` or `id`.
