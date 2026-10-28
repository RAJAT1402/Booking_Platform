import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStatus,
  Prisma,
  ShowSeatStatus,
  ShowStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { SeatSelectionDto } from './dto/seat-selection.dto';
import { BookingEmailService } from './booking-email.service';
import { BookingTicketService } from './booking-ticket.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';

// Seats are held for 2 minutes while the user completes selection/payment.
const SEAT_LOCK_TTL_MS = 2 * 60 * 1000;

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly emails: BookingEmailService,
    private readonly tickets: BookingTicketService,
  ) {}

  /**
   * Lock the selected seats for this user for SEAT_LOCK_TTL_MS.
   * All-or-nothing: if any seat is taken/held by someone else, nothing locks.
   */
  async lockSeats(userId: string, dto: SeatSelectionDto) {
    const { showId, showSeatIds } = dto;
    const show = await this.requireBookableShow(showId);

    const seats = await this.prisma.showSeat.findMany({
      where: { id: { in: showSeatIds }, showId },
      select: { id: true, status: true },
    });
    if (seats.length !== showSeatIds.length) {
      throw new NotFoundException(
        'One or more selected seats do not belong to this show',
      );
    }
    if (seats.some((s) => s.status === ShowSeatStatus.BOOKED)) {
      throw new ConflictException('One or more seats are already booked');
    }

    const acquired = await this.redis.acquireSeatLocks(
      showId,
      showSeatIds,
      userId,
      SEAT_LOCK_TTL_MS,
    );
    if (!acquired) {
      throw new ConflictException(
        'One or more seats are currently held by another user',
      );
    }

    const expiresAt = new Date(Date.now() + SEAT_LOCK_TTL_MS);
    await this.prisma.showSeat.updateMany({
      where: {
        id: { in: showSeatIds },
        status: { not: ShowSeatStatus.BOOKED },
      },
      data: { status: ShowSeatStatus.LOCKED, lockedUntil: expiresAt },
    });

    return {
      showId: show.id,
      lockedSeatIds: showSeatIds,
      expiresAt,
      ttlSeconds: SEAT_LOCK_TTL_MS / 1000,
    };
  }

  /** Voluntarily give up a hold (e.g. user deselects or leaves). */
  async releaseSeats(userId: string, dto: SeatSelectionDto) {
    const { showId, showSeatIds } = dto;
    await this.redis.releaseSeatLocks(showId, showSeatIds, userId);
    await this.prisma.showSeat.updateMany({
      where: { id: { in: showSeatIds }, status: ShowSeatStatus.LOCKED },
      data: { status: ShowSeatStatus.AVAILABLE, lockedUntil: null },
    });
    return { released: showSeatIds };
  }

  /**
   * Turn a set of held seats into a booking.
   * Requires the user to still hold the Redis locks (i.e. within the 2 min).
   */
  async confirm(userId: string, dto: SeatSelectionDto) {
    const { showId, showSeatIds } = dto;
    await this.requireBookableShow(showId);

    // Authoritative check: are the Redis locks still ours?
    const holders = await this.redis.getSeatLockHolders(showId, showSeatIds);
    if (holders.some((h) => h !== userId)) {
      throw new ConflictException(
        'Seat hold expired or not owned by you; please reselect your seats',
      );
    }

    const booking = await this.prisma.$transaction(async (tx) => {
      const showSeats = await tx.showSeat.findMany({
        where: { id: { in: showSeatIds }, showId },
        include: { seat: true },
      });
      if (showSeats.length !== showSeatIds.length) {
        throw new NotFoundException(
          'One or more selected seats do not belong to this show',
        );
      }
      if (showSeats.some((s) => s.status === ShowSeatStatus.BOOKED)) {
        throw new ConflictException('One or more seats are already booked');
      }

      const totalAmount = showSeats.reduce(
        (sum, s) => sum.plus(s.price),
        new Prisma.Decimal(0),
      );

      const created = await tx.booking.create({
        data: {
          userId,
          showId,
          status: BookingStatus.CONFIRMED,
          totalAmount,
          seats: {
            create: showSeats.map((s) => ({
              showSeatId: s.id,
              seatRow: s.seat.row,
              seatNumber: s.seat.number,
              seatCategory: s.seat.category,
              price: s.price,
            })),
          },
        },
      });

      // Flip to BOOKED, guarding against a concurrent booking of the same seat.
      const booked = await tx.showSeat.updateMany({
        where: {
          id: { in: showSeatIds },
          status: { not: ShowSeatStatus.BOOKED },
        },
        data: {
          status: ShowSeatStatus.BOOKED,
          lockedUntil: null,
          version: { increment: 1 },
        },
      });
      if (booked.count !== showSeatIds.length) {
        // Someone booked a seat between our check and here — abort.
        throw new ConflictException('One or more seats were just taken');
      }

      return created;
    });

    // Locks no longer needed — the seats are permanently BOOKED now.
    try {
      await this.redis.releaseSeatLocks(showId, showSeatIds, userId);
    } catch {
      this.logger.warn(
        `Could not release locks for confirmed booking ${booking.id}; locks will expire`,
      );
    }

    const confirmationEmail = await this.emails.sendConfirmation(booking.id);
    return { ...(await this.getOne(userId, booking.id)), confirmationEmail };
  }

  async resendConfirmation(userId: string, id: string, role: string) {
    const booking = await this.getOne(userId, id, role);
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException(
        'Only confirmed bookings can receive confirmation emails',
      );
    }
    return {
      bookingId: id,
      confirmationEmail: await this.emails.sendConfirmation(id),
    };
  }

  async verifyTicket(user: AuthUser, token: string) {
    if (user.role !== 'ADMIN' && user.role !== 'THEATRE_OWNER') {
      throw new ForbiddenException(
        'Only venue owners and admins can verify tickets',
      );
    }
    const id = this.tickets.verify(token);
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        seats: true,
        show: {
          include: { movie: true, screen: { include: { venue: true } } },
        },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (
      user.role !== 'ADMIN' &&
      booking.show.screen.venue.ownerId !== user.id
    ) {
      throw new ForbiddenException(
        'You can only verify tickets for your own venues',
      );
    }
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Booking is no longer confirmed');
    }
    if (
      booking.show.status === ShowStatus.CANCELLED ||
      booking.show.status === ShowStatus.COMPLETED ||
      booking.show.endTime <= new Date()
    ) {
      throw new BadRequestException('Show is cancelled or has ended');
    }
    return {
      valid: true,
      bookingId: booking.id,
      status: booking.status,
      movie: booking.show.movie.title,
      venue: booking.show.screen.venue.name,
      screen: booking.show.screen.name,
      startTime: booking.show.startTime,
      seats: booking.seats.map((seat) => ({
        row: seat.seatRow,
        number: seat.seatNumber,
      })),
    };
  }

  findMine(userId: string) {
    return this.prisma.booking.findMany({
      where: { userId },
      include: {
        seats: true,
        show: { include: { movie: true, screen: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(userId: string, id: string, role?: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        seats: true,
        show: { include: { movie: true, screen: true } },
      },
    });
    if (!booking) throw new NotFoundException(`Booking ${id} not found`);
    if (booking.userId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('You cannot access this booking');
    }
    return booking;
  }

  /** Cancel a booking and return its seats to the pool. */
  async cancel(userId: string, id: string, role?: string) {
    const booking = await this.getOne(userId, id, role);
    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Booking is already cancelled');
    }

    const showSeatIds = booking.seats.map((s) => s.showSeatId);

    return this.prisma.$transaction(async (tx) => {
      await tx.showSeat.updateMany({
        where: { id: { in: showSeatIds } },
        data: { status: ShowSeatStatus.AVAILABLE, lockedUntil: null },
      });
      return tx.booking.update({
        where: { id },
        data: { status: BookingStatus.CANCELLED },
        include: { seats: true },
      });
    });
  }

  private async requireBookableShow(showId: string) {
    const show = await this.prisma.show.findUnique({ where: { id: showId } });
    if (!show) throw new NotFoundException(`Show ${showId} not found`);
    if (show.status !== ShowStatus.SCHEDULED) {
      throw new BadRequestException(
        `Show is ${show.status.toLowerCase()} and not open for booking`,
      );
    }
    return show;
  }
}
