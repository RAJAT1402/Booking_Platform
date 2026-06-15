# 07 — Local Setup

## Prerequisites

- Node.js 20+
- PostgreSQL running locally (or a connection string)
- Redis (optional today; only needed once seat-locking is built)
- Google OAuth credentials (Client ID/Secret) for the login flow

## 1. Install

```bash
npm install
```

## 2. Environment

Copy `.env.example` → `.env` and fill in values:

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | Postgres connection string |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth app creds |
| `GOOGLE_CALLBACK_URL` | Default `http://localhost:3000/auth/google/callback` |
| `FRONTEND_URL` | Where to redirect after login (tokens appended as query params) |
| `JWT_SECRET` | Long random string for signing access tokens |
| `ACCESS_TOKEN_TTL` | Access token lifetime (default `15m`) |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh token lifetime in days (default `30`) |
| `REDIS_URL` | Redis (used later by seat-lock service) |

## 3. Database

```bash
npx prisma migrate dev      # apply migrations + generate client
npx prisma generate         # (if you only changed the client)
npm run seed                # seed 7 Indian cities
```

Existing migration: `prisma/migrations/20260524131810_init`.
Inspect data with `npx prisma studio`.

## 4. Run

```bash
npm run start:dev           # watch mode (recommended for dev)
npm run start               # plain
npm run start:prod          # node dist/main (after npm run build)
```

API serves on **http://localhost:3000**.

## 5. Quality & tests

```bash
npm run lint                # eslint --fix
npm run format              # prettier
npm run test                # unit tests (jest)
npm run test:e2e            # e2e (supertest)
npm run test:cov            # coverage
```

> Note: only scaffold tests exist today (`app.controller.spec.ts`, `test/app.e2e-spec.ts`).

## Quick smoke test

1. Open `http://localhost:3000/auth/google` in a browser → complete Google login.
2. You're redirected to `FRONTEND_URL?accessToken=...&refreshToken=...`.
3. Call authed routes with `Authorization: Bearer <accessToken>`.
4. Public browse: `GET /cities`, `GET /venues` need no token.
