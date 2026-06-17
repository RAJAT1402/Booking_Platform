import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SeatCategory, ShowSeatStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateShowDto } from './dto/create-show.dto';
import { FindShowsQueryDto } from './dto/find-shows-query.dto';
import { UpdateShowDto } from './dto/update-show.dto';

// Per-category price multiplier applied to a show's base price.
const CATEGORY_MULTIPLIER: Record<SeatCategory, number> = {
  REGULAR: 1,
  PREMIUM: 1.5,
  RECLINER: 2,
};

function isForeignKeyError(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code: unknown }).code === 'P2003'
  );
}

@Injectable()
export class ShowService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateShowDto) {
    const movie = await this.prisma.movie.findUnique({
      where: { id: dto.movieId },
    });
    if (!movie) throw new NotFoundException(`Movie ${dto.movieId} not found`);

    const screen = await this.prisma.screen.findUnique({
      where: { id: dto.screenId },
      include: { seats: true },
    });
    if (!screen) throw new NotFoundException(`Screen ${dto.screenId} not found`);
    if (screen.seats.length === 0) {
      throw new BadRequestException(
        `Screen ${dto.screenId} has no seats; add seats before scheduling a show`,
      );
    }

    const startTime = new Date(dto.startTime);
    const endTime = dto.endTime
      ? new Date(dto.endTime)
      : new Date(startTime.getTime() + movie.durationMin * 60_000);
    if (endTime <= startTime) {
      throw new BadRequestException('endTime must be after startTime');
    }

    const base = new Prisma.Decimal(dto.basePrice);

    // Create the show and materialize one ShowSeat per physical seat atomically.
    return this.prisma.$transaction(async (tx) => {
      const show = await tx.show.create({
        data: {
          movieId: dto.movieId,
          screenId: dto.screenId,
          startTime,
          endTime,
          basePrice: base,
          status: dto.status,
        },
      });

      await tx.showSeat.createMany({
        data: screen.seats.map((seat) => ({
          showId: show.id,
          seatId: seat.id,
          status: ShowSeatStatus.AVAILABLE,
          price: base.mul(CATEGORY_MULTIPLIER[seat.category]),
        })),
      });

      return tx.show.findUniqueOrThrow({
        where: { id: show.id },
        include: {
          movie: true,
          screen: true,
          _count: { select: { showSeats: true } },
        },
      });
    });
  }

  findAll(query: FindShowsQueryDto) {
    const where: Prisma.ShowWhereInput = {};
    if (query.movieId) where.movieId = query.movieId;
    if (query.screenId) where.screenId = query.screenId;
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.startTime = {};
      if (query.from) where.startTime.gte = new Date(query.from);
      if (query.to) where.startTime.lte = new Date(query.to);
    }

    return this.prisma.show.findMany({
      where,
      include: { movie: true, screen: true },
      orderBy: { startTime: 'asc' },
    });
  }

  async findOne(id: string) {
    const show = await this.prisma.show.findUnique({
      where: { id },
      include: {
        movie: true,
        screen: { include: { venue: true } },
        _count: { select: { showSeats: true } },
      },
    });
    if (!show) throw new NotFoundException(`Show ${id} not found`);
    return show;
  }

  /**
   * Seat map for a show: every seat with its live status and price.
   * A LOCKED seat whose hold has expired is reported as AVAILABLE (lazy expiry).
   */
  async getSeatMap(id: string) {
    await this.findOne(id);
    const now = new Date();

    const showSeats = await this.prisma.showSeat.findMany({
      where: { showId: id },
      include: { seat: true },
      orderBy: [{ seat: { row: 'asc' } }, { seat: { number: 'asc' } }],
    });

    return showSeats.map((ss) => {
      const expired =
        ss.status === ShowSeatStatus.LOCKED &&
        ss.lockedUntil !== null &&
        ss.lockedUntil < now;
      return {
        showSeatId: ss.id,
        seatId: ss.seatId,
        row: ss.seat.row,
        number: ss.seat.number,
        category: ss.seat.category,
        price: ss.price,
        status: expired ? ShowSeatStatus.AVAILABLE : ss.status,
        lockedUntil: expired ? null : ss.lockedUntil,
      };
    });
  }

  async update(id: string, dto: UpdateShowDto) {
    await this.findOne(id);
    if (dto.movieId) {
      const movie = await this.prisma.movie.findUnique({
        where: { id: dto.movieId },
      });
      if (!movie) throw new NotFoundException(`Movie ${dto.movieId} not found`);
    }

    const { startTime, endTime, basePrice, ...rest } = dto;
    return this.prisma.show.update({
      where: { id },
      data: {
        ...rest,
        ...(startTime ? { startTime: new Date(startTime) } : {}),
        ...(endTime ? { endTime: new Date(endTime) } : {}),
        ...(basePrice !== undefined
          ? { basePrice: new Prisma.Decimal(basePrice) }
          : {}),
      },
      include: { movie: true, screen: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    const bookingCount = await this.prisma.booking.count({
      where: { showId: id },
    });
    if (bookingCount > 0) {
      throw new ConflictException(
        `Show ${id} has bookings and cannot be deleted`,
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.showSeat.deleteMany({ where: { showId: id } });
        return tx.show.delete({ where: { id } });
      });
    } catch (e) {
      if (isForeignKeyError(e)) {
        throw new ConflictException(
          `Show ${id} is still referenced and cannot be deleted`,
        );
      }
      throw e;
    }
  }
}
