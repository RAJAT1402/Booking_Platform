# AI Context — Booking Platform

This folder is the **single source of truth for AI workflows** (Claude Code, etc.)
working on this repository. It records what the project is, what has been built so
far, the conventions in use, and what remains to be done — so any AI session can
get up to speed without re-reading the whole codebase.

> **Movie ticket booking platform** (BookMyShow-style) backend.
> Stack: **NestJS + Prisma + PostgreSQL** (Redis planned), Google OAuth + JWT auth.

## How to use this folder

1. Read this README first.
2. Read `05-progress-and-roadmap.md` to see current state and what's next.
3. Dive into the topic-specific file relevant to your task.
4. **Keep these files updated** when you ship a feature or change a decision.
   Treat them as living docs — stale context is worse than none.

## Index

| File | What's inside |
|------|---------------|
| [`01-project-overview.md`](./01-project-overview.md) | Product vision, goals, domain glossary |
| [`02-architecture-and-stack.md`](./02-architecture-and-stack.md) | Tech stack, app structure, request lifecycle, auth flow |
| [`03-data-model.md`](./03-data-model.md) | Prisma schema, entities, relations, design notes |
| [`04-implemented-modules.md`](./04-implemented-modules.md) | What each module does + its API endpoints |
| [`05-progress-and-roadmap.md`](./05-progress-and-roadmap.md) | ✅ Done / 🚧 In progress / 📋 TODO + roadmap |
| [`06-conventions.md`](./06-conventions.md) | Code patterns, naming, error handling, gotchas |
| [`07-local-setup.md`](./07-local-setup.md) | How to run, env vars, DB, seed, scripts |

_Last updated: 2026-06-15_
