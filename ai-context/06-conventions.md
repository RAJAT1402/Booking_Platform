# 06 — Conventions & Patterns

Follow these so new code matches what's already here.

## Module layout

Each feature lives under `src/modules/<name>/` with:

```
<name>.module.ts
<name>.controller.ts      # thin: routing + DTO binding only
<name>.service.ts         # all business logic + Prisma access
dto/                      # create-*.dto.ts, update-*.dto.ts, *-query.dto.ts
```

`UpdateXDto` is typically a partial of `CreateXDto` (manually or via mapped types).

## Controllers

- Thin. No business logic — delegate to the service.
- Use Nest decorators: `@Get/@Post/@Patch/@Delete`, `@Param`, `@Query`, `@Body`.
- Use `@HttpCode(HttpStatus.NO_CONTENT)` (204) for deletes/logout.
- Mark unauthenticated routes with `@Public()`.
- Read the user via `@CurrentUser()` → `AuthUser { id, email, role }`.
- Route prefixes are plural nouns: `/cities`, `/venues`, `/auth`.

## Services

- Constructor-inject `PrismaService` (global module, no import needed).
- Throw Nest HTTP exceptions: `NotFoundException`, `ConflictException`,
  `ForbiddenException`, `UnauthorizedException`.
- Map Prisma error codes to HTTP:
  - `P2002` (unique violation) → `ConflictException`
  - `P2003` (FK violation) → `ConflictException` (e.g. "has children attached")
  - The `isUniqueConstraintError` / `isForeignKeyError` helper pattern is duplicated
    in city/venue services — extract to a shared util if you touch this.
- `findOne` should throw `NotFoundException` when missing; update/remove call it first
  to guarantee existence.

## Validation (DTOs)

- Use `class-validator` decorators (`@IsString`, `@IsOptional`, `@MinLength`,
  `@Matches`, `@IsLatitude`, etc.).
- Global `ValidationPipe` runs with `whitelist + forbidNonWhitelisted + transform`,
  so **unknown body fields are rejected** and types are coerced. Keep DTOs accurate.
- Slugs validated with `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`.

## Naming & data

- IDs are **cuid** strings (Prisma `@default(cuid())`).
- Slugs are unique, lowercase, hyphenated; auto-generated from name when omitted
  via the private `slugify()` helper.
- **Money is `Decimal(10,2)`** — never floats.
- Timestamps: `createdAt @default(now())`, `updatedAt @updatedAt`.

## Auth conventions

- Everything is authed by default (global `JwtAuthGuard`); opt out with `@Public()`.
- JWT payload: `{ sub, email, role }`. The jwt strategy re-loads the user from DB
  on every request (so deleted users are rejected).
- Never store raw refresh tokens — only SHA-256 hashes. Rotate on every refresh.

## Style

- 2-space indent, single quotes, Prettier (`.prettierrc`) + ESLint (`.eslintrc.js`).
- `npm run format` and `npm run lint` before committing.

## Gotchas

- No RBAC guard exists yet — don't assume role is enforced; check manually or build one.
- Redis is referenced in env only; there's no Redis client/module to import.
- Schema mentions Supabase in a comment but it's not used.
