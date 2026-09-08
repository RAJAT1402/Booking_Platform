import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, Prisma, Ticket } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// 32 random bytes → a 64-character hex token. The code is the credential that
// gets scanned at the gate, so it must be unguessable, never derived from the
// booking, the user or the clock.
const TICKET_CODE_BYTES = 32;

@Injectable()
export class TicketService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Issue the ticket for a confirmed booking.
   *
   * Idempotent: a booking has at most one ticket, so calling this again (retry,
   * duplicate request, two concurrent callers) returns the existing ticket
   * instead of minting a second code.
   */
  async createTicket(bookingId: string): Promise<Ticket> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, status: true, ticket: true },
    });
    if (!booking) throw new NotFoundException(`Booking ${bookingId} not found`);
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException(
        `Booking is ${booking.status.toLowerCase()}; only a confirmed booking can be ticketed`,
      );
    }
    if (booking.ticket) return booking.ticket;

    try {
      return await this.prisma.ticket.create({
        data: { bookingId, ticketCode: this.generateTicketCode() },
      });
    } catch (err) {
      // Another request issued the ticket between our read and this write —
      // the unique constraint on bookingId is what actually guarantees one
      // ticket per booking. Hand back the winner's ticket.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const existing = await this.prisma.ticket.findUnique({
          where: { bookingId },
        });
        if (existing) return existing;
      }
      throw err;
    }
  }

  /** Issue (or re-fetch) the ticket for a booking the caller owns. */
  async issue(userId: string, bookingId: string, role?: string) {
    await this.requireOwnBooking(userId, bookingId, role);
    return this.createTicket(bookingId);
  }

  /** The ticket for a booking the caller owns; 404 if it hasn't been issued. */
  async getByBooking(userId: string, bookingId: string, role?: string) {
    await this.requireOwnBooking(userId, bookingId, role);
    const ticket = await this.prisma.ticket.findUnique({
      where: { bookingId },
    });
    if (!ticket) {
      throw new NotFoundException(
        `No ticket has been issued for booking ${bookingId}`,
      );
    }
    return ticket;
  }

  /**
   * The credential itself: 64 hex chars from the OS CSPRNG (`crypto.randomBytes`),
   * carrying no information about the booking it belongs to.
   */
  private generateTicketCode(): string {
    return randomBytes(TICKET_CODE_BYTES).toString('hex');
  }

  private async requireOwnBooking(
    userId: string,
    bookingId: string,
    role?: string,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, userId: true },
    });
    if (!booking) throw new NotFoundException(`Booking ${bookingId} not found`);
    if (booking.userId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('You cannot access this booking');
    }
    return booking;
  }
}
