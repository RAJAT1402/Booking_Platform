# 05 — Progress & Roadmap

_Snapshot as of 2026-06-15. Update this file whenever scope changes._

## ✅ Done

- **Project scaffold** — NestJS 10 + TS, ESLint/Prettier, Jest, tsconfig.
- **Prisma setup** — full production-grade schema for the whole domain, initial
  migration (`20260524131810_init`), `PrismaService` with lifecycle hooks (global module).
- **Seed** — 7 Indian cities (`prisma/seed.ts`, `npm run seed`).
- **Auth module** — Google OAuth login, JWT access tokens (15m), rotating
  SHA-256-hashed refresh tokens (30d, multi-device), global `JwtAuthGuard`,
  `@Public()` / `@CurrentUser()` decorators, `/auth/me`, `/auth/refresh`, `/auth/logout`.
- **City module** — full CRUD, slugify, conflict handling.
- **Venue module** — full CRUD, city + owner-role validation, filtered listing.
- **Global ValidationPipe** (whitelist, forbidNonWhitelisted, transform).

## 🚧 Partial / rough edges

- Write endpoints are authenticated but **not role-gated (no RBAC guard)**.
- No **ownership enforcement** (a user can create venues for any `ownerId`).
- `slugify()` duplicated across city & venue services.
- Schema comment references Supabase but auth is custom Google+JWT.

## 📋 Not built yet (the bulk of the product)

Models exist in the schema but have **no module/controller/service**:

- **Screen** module — CRUD screens under a venue.
- **Seat** module — define physical seats per screen (rows, numbers, categories),
  likely bulk-create.
- **Movie** module — CRUD movies + browse/search/filter (by language, genre, etc.).
- **Show** module — schedule shows (movie × screen × time), generate `ShowSeat`
  rows + pricing per show.
- **ShowSeat / seat-map** — fetch live seat availability for a show.
- **Booking module** ⭐ — the core flow:
  - lock seats (`status=LOCKED`, `lockedUntil`) with **optimistic locking** (`version`),
  - create PENDING booking + BookingSeat snapshots,
  - confirm on payment, release on timeout/failure.
- **Payment module** — Razorpay/Stripe integration, order creation, webhook handling,
  idempotency, refunds.
- **Redis** — seat-lock backing store / caching (env var exists, nothing wired).
- **Lock-expiry job** — background sweep to release expired `lockedUntil` seats.

## Cross-cutting / infra TODO

- RBAC guard + `@Roles()` decorator (USER / THEATRE_OWNER / ADMIN).
- Resource-ownership guard for venue/screen/show owners.
- Global exception filter + standardized error shape.
- Logging interceptor, request IDs.
- Swagger/OpenAPI docs (`@nestjs/swagger`).
- Rate limiting (`@nestjs/throttler`), CORS, helmet, security hardening.
- Health check endpoint.
- Pagination on list endpoints.
- Tests — only the default `app.controller.spec.ts` / e2e stub exist; no module tests.
- CI pipeline.

## Suggested next step

Build the **Screen → Seat → Movie → Show → ShowSeat** chain (catalog side) before
**Booking + Payment** (transaction side), since booking depends on shows and seat maps
existing. Add an RBAC guard early — most write routes need it.
