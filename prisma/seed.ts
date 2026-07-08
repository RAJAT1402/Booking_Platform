import {
  Prisma,
  PrismaClient,
  SeatCategory,
  ShowSeatStatus,
  ShowStatus,
  BookingStatus,
  PaymentProvider,
  PaymentStatus,
  UserRole,
} from '@prisma/client';

const prisma = new PrismaClient();

// Mirror of show.service.ts so seeded ShowSeat prices match what the API would
// produce when a show is created through the real endpoint.
const CATEGORY_MULTIPLIER: Record<SeatCategory, number> = {
  REGULAR: 1,
  PREMIUM: 1.5,
  RECLINER: 2,
};

// ─────────────────────────────────────────────────────────────
// Static reference data
// ─────────────────────────────────────────────────────────────

const CITIES = [
  { name: 'Delhi', state: 'Delhi', slug: 'delhi' },
  { name: 'Mumbai', state: 'Maharashtra', slug: 'mumbai' },
  { name: 'Bangalore', state: 'Karnataka', slug: 'bangalore' },
  { name: 'Hyderabad', state: 'Telangana', slug: 'hyderabad' },
  { name: 'Chennai', state: 'Tamil Nadu', slug: 'chennai' },
  { name: 'Pune', state: 'Maharashtra', slug: 'pune' },
  { name: 'Kolkata', state: 'West Bengal', slug: 'kolkata' },
  { name: 'Ahmedabad', state: 'Gujarat', slug: 'ahmedabad' },
  { name: 'Jaipur', state: 'Rajasthan', slug: 'jaipur' },
  { name: 'Lucknow', state: 'Uttar Pradesh', slug: 'lucknow' },
  { name: 'Chandigarh', state: 'Chandigarh', slug: 'chandigarh' },
  { name: 'Kochi', state: 'Kerala', slug: 'kochi' },
];

const USERS = [
  // Theatre owners
  {
    email: 'owner.pvr@knot.dating',
    googleId: 'google-owner-pvr',
    name: 'Ravi Menon',
    role: UserRole.THEATRE_OWNER,
    avatarUrl: 'https://i.pravatar.cc/150?u=owner-pvr',
    phone: '+919800000001',
  },
  {
    email: 'owner.inox@knot.dating',
    googleId: 'google-owner-inox',
    name: 'Priya Sharma',
    role: UserRole.THEATRE_OWNER,
    avatarUrl: 'https://i.pravatar.cc/150?u=owner-inox',
    phone: '+919800000002',
  },
  {
    email: 'owner.cinepolis@knot.dating',
    googleId: 'google-owner-cinepolis',
    name: 'Arjun Reddy',
    role: UserRole.THEATRE_OWNER,
    avatarUrl: 'https://i.pravatar.cc/150?u=owner-cinepolis',
    phone: '+919800000003',
  },
  // Admin
  {
    email: 'admin@knot.dating',
    googleId: 'google-admin',
    name: 'Platform Admin',
    role: UserRole.ADMIN,
    avatarUrl: 'https://i.pravatar.cc/150?u=admin',
    phone: '+919800000010',
  },
  // Regular customers
  {
    email: 'aditya@example.com',
    googleId: 'google-user-aditya',
    name: 'Aditya Kumar',
    role: UserRole.USER,
    avatarUrl: 'https://i.pravatar.cc/150?u=aditya',
    phone: '+919811111111',
  },
  {
    email: 'sneha@example.com',
    googleId: 'google-user-sneha',
    name: 'Sneha Iyer',
    role: UserRole.USER,
    avatarUrl: 'https://i.pravatar.cc/150?u=sneha',
    phone: '+919822222222',
  },
  {
    email: 'mohit@example.com',
    googleId: 'google-user-mohit',
    name: 'Mohit Verma',
    role: UserRole.USER,
    avatarUrl: 'https://i.pravatar.cc/150?u=mohit',
    phone: '+919833333333',
  },
];

const MOVIES = [
  {
    title: 'Echoes of Tomorrow',
    slug: 'echoes-of-tomorrow',
    description:
      'A physicist discovers a way to send messages to her past self, only to find every fix unravels the present in ways she never imagined.',
    language: 'English',
    durationMin: 142,
    releaseDate: new Date('2026-05-22T00:00:00.000Z'),
    posterUrl: 'https://image.tmdb.org/t/p/w500/echoes-of-tomorrow.jpg',
    rating: 8.4,
    genre: ['Sci-Fi', 'Thriller', 'Drama'],
  },
  {
    title: 'The Last Monsoon',
    slug: 'the-last-monsoon',
    description:
      'Set in 1970s Kerala, a fisherman and a schoolteacher fall in love against the backdrop of a village fighting to survive a brutal monsoon.',
    language: 'Malayalam',
    durationMin: 128,
    releaseDate: new Date('2026-04-10T00:00:00.000Z'),
    posterUrl: 'https://image.tmdb.org/t/p/w500/the-last-monsoon.jpg',
    rating: 8.9,
    genre: ['Romance', 'Drama'],
  },
  {
    title: 'Neon Bazaar',
    slug: 'neon-bazaar',
    description:
      'A small-time hacker in Mumbai stumbles onto a syndicate trading stolen identities and must outrun both the cops and the cartel.',
    language: 'Hindi',
    durationMin: 137,
    releaseDate: new Date('2026-06-05T00:00:00.000Z'),
    posterUrl: 'https://image.tmdb.org/t/p/w500/neon-bazaar.jpg',
    rating: 7.6,
    genre: ['Action', 'Crime', 'Thriller'],
  },
  {
    title: 'Paper Boats',
    slug: 'paper-boats',
    description:
      'Two estranged siblings reunite for a road trip to scatter their fathers ashes, rediscovering the childhood they thought they lost.',
    language: 'Hindi',
    durationMin: 119,
    releaseDate: new Date('2026-03-28T00:00:00.000Z'),
    posterUrl: 'https://image.tmdb.org/t/p/w500/paper-boats.jpg',
    rating: 8.1,
    genre: ['Drama', 'Comedy'],
  },
  {
    title: 'Quantum Heist',
    slug: 'quantum-heist',
    description:
      'A crew of thieves uses experimental teleportation tech to rob the worlds most secure vault — but the machine has a mind of its own.',
    language: 'English',
    durationMin: 151,
    releaseDate: new Date('2026-06-12T00:00:00.000Z'),
    posterUrl: 'https://image.tmdb.org/t/p/w500/quantum-heist.jpg',
    rating: 7.9,
    genre: ['Action', 'Sci-Fi', 'Heist'],
  },
  {
    title: 'Mango Summer',
    slug: 'mango-summer',
    description:
      'A coming-of-age comedy about a teenager spending one chaotic summer at his grandmothers mango orchard in rural Andhra.',
    language: 'Telugu',
    durationMin: 124,
    releaseDate: new Date('2026-05-01T00:00:00.000Z'),
    posterUrl: 'https://image.tmdb.org/t/p/w500/mango-summer.jpg',
    rating: 7.4,
    genre: ['Comedy', 'Family'],
  },
  {
    title: 'Silent Frequency',
    slug: 'silent-frequency',
    description:
      'A deaf sound engineer is the only witness to a crime she could not hear, and the only one who can decode the evidence everyone else missed.',
    language: 'Tamil',
    durationMin: 133,
    releaseDate: new Date('2026-06-14T00:00:00.000Z'),
    posterUrl: 'https://image.tmdb.org/t/p/w500/silent-frequency.jpg',
    rating: 8.2,
    genre: ['Thriller', 'Mystery'],
  },
  {
    title: 'Starlight Express',
    slug: 'starlight-express',
    description:
      'An animated musical adventure about a runaway train that carries a group of misfit kids to a city floating among the stars.',
    language: 'English',
    durationMin: 98,
    releaseDate: new Date('2026-06-19T00:00:00.000Z'),
    posterUrl: 'https://image.tmdb.org/t/p/w500/starlight-express.jpg',
    rating: 7.1,
    genre: ['Animation', 'Musical', 'Family'],
  },
];

// Venues: one or more per city so every city has something to browse.
const VENUES = [
  {
    name: 'PVR Select Citywalk',
    slug: 'pvr-select-citywalk-delhi',
    address: 'Saket District Centre, Saket, New Delhi',
    citySlug: 'delhi',
    ownerEmail: 'owner.pvr@knot.dating',
    lat: 28.5285,
    lng: 77.2195,
  },
  {
    name: 'INOX R-City',
    slug: 'inox-rcity-mumbai',
    address: 'R-City Mall, LBS Marg, Ghatkopar West, Mumbai',
    citySlug: 'mumbai',
    ownerEmail: 'owner.inox@knot.dating',
    lat: 19.0989,
    lng: 72.9112,
  },
  {
    name: 'Cinepolis Forum Mall',
    slug: 'cinepolis-forum-bangalore',
    address: 'Forum Mall, Hosur Road, Koramangala, Bangalore',
    citySlug: 'bangalore',
    ownerEmail: 'owner.cinepolis@knot.dating',
    lat: 12.9345,
    lng: 77.6115,
  },
  {
    name: 'PVR Inorbit',
    slug: 'pvr-inorbit-hyderabad',
    address: 'Inorbit Mall, Madhapur, Hyderabad',
    citySlug: 'hyderabad',
    ownerEmail: 'owner.pvr@knot.dating',
    lat: 17.4345,
    lng: 78.3833,
  },
  {
    name: 'INOX Phoenix Marketcity',
    slug: 'inox-phoenix-pune',
    address: 'Phoenix Marketcity, Viman Nagar, Pune',
    citySlug: 'pune',
    ownerEmail: 'owner.inox@knot.dating',
    lat: 18.5618,
    lng: 73.9165,
  },
  {
    name: 'Cinepolis Express Avenue',
    slug: 'cinepolis-express-avenue-chennai',
    address: 'Express Avenue Mall, Royapettah, Chennai',
    citySlug: 'chennai',
    ownerEmail: 'owner.cinepolis@knot.dating',
    lat: 13.0588,
    lng: 80.2645,
  },
  {
    name: 'INOX South City',
    slug: 'inox-south-city-kolkata',
    address: 'South City Mall, Prince Anwar Shah Road, Kolkata',
    citySlug: 'kolkata',
    ownerEmail: 'owner.inox@knot.dating',
    lat: 22.5006,
    lng: 88.3618,
  },
  {
    name: 'PVR Acropolis',
    slug: 'pvr-acropolis-ahmedabad',
    address: 'Acropolis Mall, Thaltej, Ahmedabad',
    citySlug: 'ahmedabad',
    ownerEmail: 'owner.pvr@knot.dating',
    lat: 23.0465,
    lng: 72.5102,
  },
  {
    name: 'Cinepolis WTP',
    slug: 'cinepolis-wtp-jaipur',
    address: 'World Trade Park, Malviya Nagar, Jaipur',
    citySlug: 'jaipur',
    ownerEmail: 'owner.cinepolis@knot.dating',
    lat: 26.8505,
    lng: 75.8059,
  },
  {
    name: 'INOX Riverside',
    slug: 'inox-riverside-lucknow',
    address: 'Riverside Mall, Gomti Nagar, Lucknow',
    citySlug: 'lucknow',
    ownerEmail: 'owner.inox@knot.dating',
    lat: 26.8512,
    lng: 81.0029,
  },
  {
    name: 'PVR Elante',
    slug: 'pvr-elante-chandigarh',
    address: 'Elante Mall, Industrial Area Phase 1, Chandigarh',
    citySlug: 'chandigarh',
    ownerEmail: 'owner.pvr@knot.dating',
    lat: 30.7058,
    lng: 76.8013,
  },
  {
    name: 'Cinepolis Lulu Mall',
    slug: 'cinepolis-lulu-kochi',
    address: 'Lulu Mall, Edappally, Kochi',
    citySlug: 'kochi',
    ownerEmail: 'owner.cinepolis@knot.dating',
    lat: 10.0274,
    lng: 76.3080,
  },
];

// ─────────────────────────────────────────────────────────────
// Seat layout: 8 rows (A–H) × 12 seats = 96 seats per screen.
//   Rows A–D → REGULAR, E–F → PREMIUM, G–H → RECLINER
// ─────────────────────────────────────────────────────────────

function buildSeatLayout(): { row: string; number: number; category: SeatCategory }[] {
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const seatsPerRow = 12;
  const layout: { row: string; number: number; category: SeatCategory }[] = [];

  for (const row of rows) {
    let category: SeatCategory = SeatCategory.REGULAR;
    if (row === 'E' || row === 'F') category = SeatCategory.PREMIUM;
    if (row === 'G' || row === 'H') category = SeatCategory.RECLINER;

    for (let n = 1; n <= seatsPerRow; n++) {
      layout.push({ row, number: n, category });
    }
  }
  return layout;
}

// Show times generated relative to "today" so the data is always upcoming.
const SHOW_SLOTS = [10, 13, 17, 21]; // hour of day (local)
const SHOW_DAYS = 4; // today + next 3 days
const SHOW_BASE_PRICES = [180, 220, 250, 300];

async function wipe() {
  // Delete in FK-safe order.
  await prisma.bookingSeat.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.showSeat.deleteMany();
  await prisma.show.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.screen.deleteMany();
  await prisma.venue.deleteMany();
  await prisma.movie.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  // Cities are kept/upserted (referenced by slug elsewhere).
}

async function main() {
  console.log('🌱  Seeding dummy data...');
  await wipe();

  // ── Cities ────────────────────────────────────────────────
  const cityBySlug = new Map<string, string>();
  for (const c of CITIES) {
    const city = await prisma.city.upsert({
      where: { slug: c.slug },
      update: { name: c.name, state: c.state },
      create: c,
    });
    cityBySlug.set(c.slug, city.id);
  }
  console.log(`   ✓ ${CITIES.length} cities`);

  // ── Users ─────────────────────────────────────────────────
  const userByEmail = new Map<string, string>();
  for (const u of USERS) {
    const user = await prisma.user.create({ data: u });
    userByEmail.set(u.email, user.id);
  }
  console.log(`   ✓ ${USERS.length} users (3 owners, 1 admin, 3 customers)`);

  // ── Movies ────────────────────────────────────────────────
  const movieIds: string[] = [];
  for (const m of MOVIES) {
    const movie = await prisma.movie.create({ data: m });
    movieIds.push(movie.id);
  }
  console.log(`   ✓ ${MOVIES.length} movies`);

  // ── Venues + Screens + Seats ──────────────────────────────
  const screenIds: string[] = [];
  for (const v of VENUES) {
    const venue = await prisma.venue.create({
      data: {
        name: v.name,
        slug: v.slug,
        address: v.address,
        lat: v.lat,
        lng: v.lng,
        cityId: cityBySlug.get(v.citySlug)!,
        ownerId: userByEmail.get(v.ownerEmail)!,
      },
    });

    // 2 screens per venue
    for (let s = 1; s <= 2; s++) {
      const layout = buildSeatLayout();
      const screen = await prisma.screen.create({
        data: {
          name: `Screen ${s}`,
          totalSeats: layout.length,
          venueId: venue.id,
        },
      });
      await prisma.seat.createMany({
        data: layout.map((seat) => ({ ...seat, screenId: screen.id })),
      });
      screenIds.push(screen.id);
    }
  }
  console.log(
    `   ✓ ${VENUES.length} venues, ${screenIds.length} screens, ${screenIds.length * 96} seats`,
  );

  // ── Shows + ShowSeats ─────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let showCount = 0;
  let showSeatCount = 0;
  const createdShows: { id: string; basePrice: number }[] = [];

  for (let si = 0; si < screenIds.length; si++) {
    const screenId = screenIds[si];
    const seats = await prisma.seat.findMany({ where: { screenId } });

    for (let day = 0; day < SHOW_DAYS; day++) {
      for (let slot = 0; slot < SHOW_SLOTS.length; slot++) {
        // Rotate movies so each screen shows a varied lineup.
        const movieIdx = (si + day + slot) % movieIds.length;
        const movieId = movieIds[movieIdx];
        const movie = MOVIES[movieIdx];
        const basePrice =
          SHOW_BASE_PRICES[(si + slot) % SHOW_BASE_PRICES.length];

        const startTime = new Date(today);
        startTime.setDate(startTime.getDate() + day);
        startTime.setHours(SHOW_SLOTS[slot], 0, 0, 0);
        const endTime = new Date(
          startTime.getTime() + movie.durationMin * 60_000,
        );

        const base = new Prisma.Decimal(basePrice);
        const show = await prisma.show.create({
          data: {
            movieId,
            screenId,
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

        createdShows.push({ id: show.id, basePrice });
        showCount++;
        showSeatCount += seats.length;
      }
    }
  }
  console.log(`   ✓ ${showCount} shows, ${showSeatCount} show-seats`);

  // ── Sample bookings (confirmed + paid) ────────────────────
  // Give a few customers booking history and mark some seats BOOKED so the
  // seat-map endpoint returns a realistic mix of AVAILABLE / BOOKED.
  const customers = [
    userByEmail.get('aditya@example.com')!,
    userByEmail.get('sneha@example.com')!,
    userByEmail.get('mohit@example.com')!,
  ];

  let bookingCount = 0;
  for (let i = 0; i < customers.length; i++) {
    const userId = customers[i];
    // Pick a distinct upcoming show for each customer.
    const show = createdShows[i * 3 + 1];
    const showSeats = await prisma.showSeat.findMany({
      where: { showId: show.id, status: ShowSeatStatus.AVAILABLE },
      include: { seat: true },
      orderBy: [{ seat: { row: 'asc' } }, { seat: { number: 'asc' } }],
      take: 2,
    });

    const totalAmount = showSeats.reduce(
      (sum, ss) => sum.add(ss.price),
      new Prisma.Decimal(0),
    );

    await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.create({
        data: {
          userId,
          showId: show.id,
          status: BookingStatus.CONFIRMED,
          totalAmount,
        },
      });

      for (const ss of showSeats) {
        await tx.showSeat.update({
          where: { id: ss.id },
          data: { status: ShowSeatStatus.BOOKED },
        });
        await tx.bookingSeat.create({
          data: {
            bookingId: booking.id,
            showSeatId: ss.id,
            seatRow: ss.seat.row,
            seatNumber: ss.seat.number,
            seatCategory: ss.seat.category,
            price: ss.price,
          },
        });
      }

      await tx.payment.create({
        data: {
          bookingId: booking.id,
          provider:
            i % 2 === 0 ? PaymentProvider.RAZORPAY : PaymentProvider.STRIPE,
          providerOrderId: `order_seed_${i}_${booking.id.slice(-6)}`,
          idempotencyKey: `idem_seed_${i}_${booking.id.slice(-6)}`,
          amount: totalAmount,
          status: PaymentStatus.SUCCESS,
          paidAt: new Date(),
        },
      });
    });
    bookingCount++;
  }
  console.log(`   ✓ ${bookingCount} sample confirmed bookings (with payments)`);

  console.log('✅  Seed complete.');
}

main()
  .catch((e) => {
    console.error('❌  Seed failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
