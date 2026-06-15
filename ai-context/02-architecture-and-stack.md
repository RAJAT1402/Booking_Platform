# 02 — Architecture & Stack

## Tech stack

| Concern | Choice |
|---------|--------|
| Framework | **NestJS 10** (TypeScript) |
| ORM | **Prisma 6** |
| Database | **PostgreSQL** |
| Auth | **Google OAuth 2.0** (passport-google-oauth20) + **JWT** (passport-jwt) |
| Validation | `class-validator` + `class-transformer` (global `ValidationPipe`) |
| Cache/locks | **Redis** — _planned, not wired up yet_ (`REDIS_URL` in env) |
| Tests | Jest (`*.spec.ts`) + Supertest e2e |

Node tooling: ESLint + Prettier. Entry point `src/main.ts`, app listens on **port 3000**.

## Project structure

```
src/
  main.ts                  # bootstrap, global ValidationPipe
  app.module.ts            # root module; registers global JwtAuthGuard
  app.controller.ts        # health/hello
  prisma/
    prisma.module.ts       # global PrismaModule
    prisma.service.ts      # PrismaClient lifecycle (connect/disconnect)
  modules/
    auth/                  # Google OAuth + JWT + refresh-token rotation
      strategies/          # google.strategy.ts, jwt.strategy.ts
      guards/              # jwt-auth.guard.ts (global), google-auth.guard.ts
      decorators/          # @Public(), @CurrentUser()
      dto/                 # refresh.dto.ts
    city/                  # CRUD for cities
    venue/                 # CRUD for venues (+ owner/city validation)
prisma/
  schema.prisma            # full domain model (see 03-data-model.md)
  migrations/              # 20260524131810_init
  seed.ts                  # seeds 7 Indian cities
```

## Module wiring (`app.module.ts`)

- `ConfigModule.forRoot({ isGlobal: true })` — env config everywhere.
- `PrismaModule` — global, exports `PrismaService`.
- `AuthModule`, `CityModule`, `VenueModule`.
- **Global guard:** `JwtAuthGuard` is registered via `APP_GUARD`, so **every route
  requires a valid JWT by default**. Opt out per-route with `@Public()`.

## Request lifecycle

```
Request
  → Global ValidationPipe (whitelist + forbidNonWhitelisted + transform)
  → Global JwtAuthGuard (unless @Public)
      → passport-jwt strategy validates Bearer token,
        looks up User in DB, attaches { id, email, role } to req.user
  → Controller (@CurrentUser() reads req.user)
  → Service (business logic + Prisma)
```

## Auth flow (detail)

```
GET /auth/google
  → redirect to Google consent (GoogleAuthGuard / google.strategy)
GET /auth/google/callback
  → google.strategy.validate() builds GoogleProfilePayload
  → AuthService.loginWithGoogle() upserts User by googleId
  → issues { accessToken (JWT, 15m), refreshToken (opaque, 30d) }
  → redirects to FRONTEND_URL?accessToken=...&refreshToken=...
POST /auth/refresh   (Public)
  → validates + ROTATES refresh token (old one revoked, new pair issued)
POST /auth/logout    (authed)
  → revokes the given refresh token
GET  /auth/me        (authed)
  → returns current user profile
```

**Token model:**
- **Access token** = JWT signed with `JWT_SECRET`, TTL `ACCESS_TOKEN_TTL` (default 15m),
  payload `{ sub, email, role }`.
- **Refresh token** = random 48-byte hex, stored only as a **SHA-256 hash** in the
  `RefreshToken` table. Rotation on every refresh; one row per active session
  (multi-device supported). Revocation via `revokedAt`.

## Not yet wired

- Redis (seat locks / caching) — env var exists, no client/module.
- No global exception filter, interceptors, logging, rate limiting, or Swagger yet.
- No RBAC guard — role exists on the user but isn't enforced via a guard/decorator
  (venue ownership is checked manually in `VenueService`).
