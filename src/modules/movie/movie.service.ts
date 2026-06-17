import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMovieDto } from './dto/create-movie.dto';
import { FindMoviesQueryDto } from './dto/find-movies-query.dto';
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

  async findOne(id: string) {
    const movie = await this.prisma.movie.findUnique({ where: { id } });
    if (!movie) throw new NotFoundException(`Movie ${id} not found`);
    return movie;
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
