import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ShowSeatStatus, ShowStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMovieDto } from './dto/create-movie.dto';
import { FindMoviesQueryDto } from './dto/find-movies-query.dto';
import { FindShowtimesQueryDto } from './dto/find-showtimes-query.dto';
import { UpdateMovieDto } from './dto/update-movie.dto';

function isUniqueConstraintError(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code: unknown }).code === 'P2002'
  );
}

function isForeignKeyError(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code: unknown }).code === 'P2003'
  );
}

@Injectable()
export class MovieService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMovieDto) {
    const slug = dto.slug ?? this.slugify(dto.title);

    try {
      return await this.prisma.movie.create({
        data: {
          title: dto.title,
          slug,
          description: dto.description,
          language: dto.language,
          durationMin: dto.durationMin,
          releaseDate: new Date(dto.releaseDate),
          posterUrl: dto.posterUrl,
          rating: dto.rating,
          genre: dto.genre,
          isRecommended: dto.isRecommended,
        },
      });
    } catch (e) {
      if (isUniqueConstraintError(e)) {
        throw new ConflictException(`Movie with slug "${slug}" already exists`);
      }
      throw e;
    }
  }

  findAll(query: FindMoviesQueryDto) {
    const where: Record<string, unknown> = {};
    if (query.q) where.title = { contains: query.q, mode: 'insensitive' };
    if (query.language)
      where.language = { equals: query.language, mode: 'insensitive' };
    if (query.genre) where.genre = { has: query.genre };

    return this.prisma.movie.findMany({
      where,
      orderBy: { releaseDate: 'desc' },
    });
  }

  findRecommended() {
    return this.prisma.movie.findMany({
      where: { isRecommended: true },
      orderBy: { releaseDate: 'desc' },
    });
  }

  // Top 3 recommended movies for the homepage carousel:
  // highest rated first, newest release as the tiebreaker.
  async findCarousel() {
    return this.prisma.movie.findMany({
      where: { isRecommended: true },
      orderBy: [{ rating: 'desc' }, { releaseDate: 'desc' }],
      take: 3,
    });
  }

  async findOne(id: string) {
    const movie = await this.prisma.movie.findUnique({ where: { id } });
    if (!movie) throw new NotFoundException(`Movie ${id} not found`);
    return movie;
  }

  /**
   * Showtimes screen: for a movie, all upcoming scheduled shows grouped by the
   * cinema (venue) they play at. Optionally filtered to a city and/or a single day.
   * Each show carries its screen, price, and a live count of available seats.
   */
  async findShowtimes(movieId: string, query: FindShowtimesQueryDto) {
    const movie = await this.findOne(movieId);

    const startTime: { gte: Date; lt?: Date } = { gte: new Date() };
    if (query.date) {
      const dayStart = new Date(`${query.date}T00:00:00.000Z`);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      // Never show shows in the past, even within the requested day.
      if (dayStart > startTime.gte) startTime.gte = dayStart;
      startTime.lt = dayEnd;
    }

    const shows = await this.prisma.show.findMany({
      where: {
        movieId,
        status: ShowStatus.SCHEDULED,
        startTime,
        ...(query.cityId ? { screen: { venue: { cityId: query.cityId } } } : {}),
      },
      orderBy: { startTime: 'asc' },
      include: {
        screen: { include: { venue: { include: { city: true } } } },
        _count: {
          select: { showSeats: { where: { status: ShowSeatStatus.AVAILABLE } } },
        },
      },
    });

    // Group the flat show list by venue, preserving startTime order within each.
    const byVenue = new Map<
      string,
      {
        venue: (typeof shows)[number]['screen']['venue'];
        shows: Array<Record<string, unknown>>;
      }
    >();

    for (const show of shows) {
      const venue = show.screen.venue;
      if (!byVenue.has(venue.id)) {
        byVenue.set(venue.id, { venue, shows: [] });
      }
      byVenue.get(venue.id)!.shows.push({
        showId: show.id,
        startTime: show.startTime,
        endTime: show.endTime,
        basePrice: show.basePrice,
        screenId: show.screenId,
        screenName: show.screen.name,
        availableSeats: show._count.showSeats,
      });
    }

    return {
      movie,
      venues: Array.from(byVenue.values()),
    };
  }

  async findBySlug(slug: string) {
    const movie = await this.prisma.movie.findUnique({ where: { slug } });
    if (!movie) throw new NotFoundException(`Movie "${slug}" not found`);
    return movie;
  }

  async update(id: string, dto: UpdateMovieDto) {
    await this.findOne(id);

    const { releaseDate, ...rest } = dto;

    try {
      return await this.prisma.movie.update({
        where: { id },
        data: {
          ...rest,
          ...(releaseDate ? { releaseDate: new Date(releaseDate) } : {}),
        },
      });
    } catch (e) {
      if (isUniqueConstraintError(e)) {
        throw new ConflictException(
          `Movie with slug "${dto.slug}" already exists`,
        );
      }
      throw e;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    try {
      return await this.prisma.movie.delete({ where: { id } });
    } catch (e) {
      if (isForeignKeyError(e)) {
        throw new ConflictException(
          `Movie ${id} has shows scheduled; remove shows first`,
        );
      }
      throw e;
    }
  }

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
