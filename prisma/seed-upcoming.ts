/**
 * Additive seed for real upcoming releases.
 *
 * Unlike `seed.ts`, this NEVER wipes anything — it upserts movies by slug and
 * (re)builds only their own shows, so existing movie/venue/user IDs stay valid.
 * Safe to re-run.
 *
 *   npx ts-node prisma/seed-upcoming.ts
 */
import {
  Prisma,
  PrismaClient,
  SeatCategory,
  ShowSeatStatus,
  ShowStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

// Mirror of show.service.ts so prices match what the real endpoint produces.
const CATEGORY_MULTIPLIER: Record<SeatCategory, number> = {
  REGULAR: 1,
  PREMIUM: 1.5,
  RECLINER: 2,
};

// ─────────────────────────────────────────────────────────────
// Movies
//
// NOTE: title + releaseDate are as specified. Everything else
// (description, durationMin, rating, posterUrl, genre) is placeholder —
// replace with real values before this goes anywhere user-facing.
// ─────────────────────────────────────────────────────────────
const UPCOMING = [
  {
    title: 'Toxic: A Fairy Tale for Grown-Ups',
    slug: 'toxic',
    description:
      'A gangster drama following a ruthless kingpin through the neon-lit underbelly of the city.',
    language: 'Kannada',
    durationMin: 155,
    releaseDate: new Date('2026-08-27T00:00:00.000Z'),
    posterUrl: null,
    rating: null,
    genre: ['Action', 'Crime', 'Drama'],
    isRecommended: true,
  },
  {
    title: 'Eetha',
    slug: 'eetha',
    description:
      'A rural revenge saga about a man who returns to the village that cast him out.',
    language: 'Telugu',
    durationMin: 145,
    releaseDate: new Date('2026-08-14T00:00:00.000Z'),
    posterUrl: null,
    rating: null,
    genre: ['Action', 'Drama'],
    isRecommended: true,
  },
  {
    title: 'Awarapan 2',
    slug: 'awarapan-2',
    description:
      'A former enforcer is pulled back into the world he left behind, haunted by the love he could not save.',
    language: 'Hindi',
    durationMin: 140,
    releaseDate: new Date('2026-08-14T00:00:00.000Z'),
    posterUrl: null,
    rating: null,
    genre: ['Action', 'Romance', 'Thriller'],
    isRecommended: true,
  },
];

// ─────────────────────────────────────────────────────────────
// Show generation knobs
// ─────────────────────────────────────────────────────────────
// Row count = movies x venues x SCREENS_PER_VENUE x SHOW_DAYS x slots x 96 seats.
// Defaults below: 3 x 12 x 1 x 7 x 3 = 756 shows, ~72k show-seats. Raise
// carefully — this writes over a connection pooler and is not fast.
const SHOW_SLOTS = [10, 15, 20]; // hour of day, local time
const SHOW_DAYS = 7; // days of shows from release date onward
const SHOW_BASE_PRICES = [200, 250, 300];
const SCREENS_PER_VENUE = 1; // bump for more shows (and far more rows)

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function main() {
  console.log('🎬  Seeding upcoming releases (additive)...');

  // One screen per venue, so every venue appears on the showtimes page.
  const venues = await prisma.venue.findMany({
    include: { screens: { orderBy: { name: 'asc' } } },
    orderBy: { name: 'asc' },
  });
  const screens = venues.flatMap((v) => v.screens.slice(0, SCREENS_PER_VENUE));

  if (screens.length === 0) {
    throw new Error('No screens found — run `npm run seed` first.');
  }
  console.log(`   • ${screens.length} screens across ${venues.length} venues`);

  const seatsByScreen = new Map<string, Awaited<ReturnType<typeof prisma.seat.findMany>>>();
  for (const screen of screens) {
    seatsByScreen.set(
      screen.id,
      await prisma.seat.findMany({ where: { screenId: screen.id } }),
    );
  }

  const today = startOfToday();

  for (const data of UPCOMING) {
    const { isRecommended, ...movieFields } = data;

    const movie = await prisma.movie.upsert({
      where: { slug: data.slug },
      update: { ...movieFields, isRecommended },
      create: { ...movieFields, isRecommended },
    });
    console.log(`\n   ▸ ${movie.title}  (${movie.id})`);

    // Rebuild this movie's shows only. Refuse if any carry bookings.
    const existing = await prisma.show.findMany({
      where: { movieId: movie.id },
      select: { id: true, _count: { select: { bookings: true } } },
    });
    const booked = existing.filter((s) => s._count.bookings > 0);
    if (booked.length > 0) {
      console.log(
        `     ! ${booked.length} existing shows have bookings — skipping rebuild`,
      );
      continue;
    }
    if (existing.length > 0) {
      const ids = existing.map((s) => s.id);
      await prisma.showSeat.deleteMany({ where: { showId: { in: ids } } });
      await prisma.show.deleteMany({ where: { id: { in: ids } } });
      console.log(`     - cleared ${existing.length} old shows`);
    }

    // Shows run from release date (or today, if already released) forward.
    const firstDay =
      data.releaseDate > today ? new Date(data.releaseDate) : new Date(today);
    firstDay.setHours(0, 0, 0, 0);

    let shows = 0;
    let showSeats = 0;

    for (let si = 0; si < screens.length; si++) {
      const screen = screens[si];
      const seats = seatsByScreen.get(screen.id) ?? [];
      if (seats.length === 0) continue;

      for (let day = 0; day < SHOW_DAYS; day++) {
        for (let slot = 0; slot < SHOW_SLOTS.length; slot++) {
          const startTime = new Date(firstDay);
          startTime.setDate(startTime.getDate() + day);
          startTime.setHours(SHOW_SLOTS[slot], 0, 0, 0);

          // Never create a show in the past (matters on release day itself).
          if (startTime <= new Date()) continue;

          const endTime = new Date(
            startTime.getTime() + data.durationMin * 60_000,
          );
          const base = new Prisma.Decimal(
            SHOW_BASE_PRICES[(si + slot) % SHOW_BASE_PRICES.length],
          );

          const show = await prisma.show.create({
            data: {
              movieId: movie.id,
              screenId: screen.id,
              startTime,
              endTime,
              basePrice: base,
              status: ShowStatus.SCHEDULED,
            },
          });

          await prisma.showSeat.createMany({
            data: seats.map((seat) => ({
              showId: show.id,
              seatId: seat.id,
              status: ShowSeatStatus.AVAILABLE,
              price: base.mul(CATEGORY_MULTIPLIER[seat.category]),
            })),
          });

          shows++;
          showSeats += seats.length;
        }
      }
    }

    console.log(
      `     ✓ ${shows} shows, ${showSeats} show-seats ` +
        `(from ${firstDay.toDateString()})`,
    );
  }

  console.log('\n✅  Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
