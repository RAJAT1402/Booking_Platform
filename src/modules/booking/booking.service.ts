import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  BookingStatus,
  PaymentStatus,
  PaymentProvider,
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
import { randomUUID } from 'node:crypto';
import { RazorpayService } from './razorpay.service';

// Seats are held for 2 minutes while the user completes selection/payment.
const SEAT_LOCK_TTL_MS = 2 * 60 * 1000;
const CHECKOUT_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class BookingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BookingService.name);
  private expiryTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly emails: BookingEmailService,
    private readonly tickets: BookingTicketService,
    private readonly razorpay: RazorpayService,
  ) {}

  onModuleInit() {
    this.expiryTimer = setInterval(() => {
      void this.runMaintenance().catch((error) =>
        this.logger.error(`Booking expiry sweep failed: ${error.message}`),
      );
    }, 60_000);
    this.expiryTimer.unref();
  }

  onModuleDestroy() {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
  }

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
    const updated = await this.prisma.showSeat.updateMany({
      where: {
        id: { in: showSeatIds },
        showId,
        OR: [
          { status: ShowSeatStatus.AVAILABLE },
          { status: ShowSeatStatus.LOCKED, lockedUntil: { lt: new Date() } },
          { status: ShowSeatStatus.LOCKED, lockToken: userId },
        ],
      },
      data: {
        status: ShowSeatStatus.LOCKED,
        lockedUntil: expiresAt,
        lockToken: userId,
      },
    });
    if (updated.count !== showSeatIds.length) {
      await this.redis.releaseSeatLocks(showId, showSeatIds, userId);
      await this.prisma.showSeat.updateMany({
        where: {
          id: { in: showSeatIds },
          showId,
          lockToken: userId,
          status: ShowSeatStatus.LOCKED,
        },
        data: {
          status: ShowSeatStatus.AVAILABLE,
          lockedUntil: null,
          lockToken: null,
        },
      });
      throw new ConflictException('One or more seats are no longer available');
    }

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
    const result = await this.prisma.showSeat.updateMany({
      where: {
        id: { in: showSeatIds },
        showId,
        status: ShowSeatStatus.LOCKED,
        lockToken: userId,
      },
      data: {
        status: ShowSeatStatus.AVAILABLE,
        lockedUntil: null,
        lockToken: null,
      },
    });
    return { released: result.count };
  }

  /**
   * Turn selected seats into a pending booking and a Razorpay order.
   * A ticket is issued only after a captured payment is verified.
   */
  async createCheckout(userId: string, dto: SeatSelectionDto) {
    const { showId, showSeatIds } = dto;
    await this.requireBookableShow(showId);
    const bookingId = randomUUID();
    const transferred = await this.redis.transferSeatLocks(
      showId,
      showSeatIds,
      userId,
      bookingId,
      CHECKOUT_TTL_MS,
    );
    if (!transferred) {
      throw new ConflictException(
        'Seat hold expired or not owned by you; please reselect your seats',
      );
    }
    const expiresAt = new Date(Date.now() + CHECKOUT_TTL_MS);
    let booking: { id: string; totalAmount: Prisma.Decimal };
    try {
      booking = await this.prisma.$transaction(async (tx) => {
        const showSeats = await tx.showSeat.findMany({
          where: { id: { in: showSeatIds }, showId },
          include: { seat: true },
        });
        if (showSeats.length !== showSeatIds.length) {
          throw new NotFoundException(
            'One or more selected seats do not belong to this show',
          );
        }
        if (
          showSeats.some(
            (s) =>
              s.status !== ShowSeatStatus.LOCKED ||
              s.lockToken !== userId ||
              !s.lockedUntil ||
              s.lockedUntil <= new Date(),
          )
        ) {
          throw new ConflictException('One or more seat holds have expired');
        }

        const totalAmount = showSeats.reduce(
          (sum, s) => sum.plus(s.price),
          new Prisma.Decimal(0),
        );

        const updated = await tx.showSeat.updateMany({
          where: {
            id: { in: showSeatIds },
            showId,
            status: ShowSeatStatus.LOCKED,
            lockToken: userId,
            lockedUntil: { gt: new Date() },
          },
          data: {
            lockToken: bookingId,
            lockedUntil: expiresAt,
            version: { increment: 1 },
          },
        });
        if (updated.count !== showSeatIds.length) {
          throw new ConflictException('One or more seat holds have expired');
        }

        return tx.booking.create({
          data: {
            id: bookingId,
            userId,
            showId,
            status: BookingStatus.PENDING,
            totalAmount,
            expiresAt,
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
      });
    } catch (error) {
      await this.redis.releaseSeatLocks(showId, showSeatIds, bookingId);
      throw error;
    }

    try {
      const amountPaise = this.toPaise(booking.totalAmount);
      const order = await this.razorpay.createOrder(booking.id, amountPaise);
      await this.prisma.payment.create({
        data: {
          bookingId: booking.id,
          provider: PaymentProvider.RAZORPAY,
          providerOrderId: order.id,
          amount: booking.totalAmount,
          status: PaymentStatus.INITIATED,
        },
      });
      return {
        bookingId: booking.id,
        orderId: order.id,
        keyId: this.razorpay.checkoutKeyId,
        amount: amountPaise,
        currency: 'INR',
        expiresAt,
      };
    } catch (error) {
      await this.expireBooking(booking.id, BookingStatus.FAILED);
      throw error;
    }
  }

  async verifyPayment(
    userId: string,
    bookingId: string,
    orderId: string,
    paymentId: string,
    signature: string,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { payment: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== userId)
      throw new ForbiddenException('You cannot access this booking');
    if (!booking.payment || booking.payment.providerOrderId !== orderId) {
      throw new BadRequestException('Payment order does not match booking');
    }
    this.razorpay.verifyCheckoutSignature(orderId, paymentId, signature);
    const result = await this.processCapturedPayment(orderId, paymentId);
    if (result.status !== BookingStatus.CONFIRMED) {
      throw new ConflictException(
        'Booking expired before payment completed; refund is being processed',
      );
    }
    return this.getOne(userId, bookingId);
  }

  async processCapturedPayment(orderId: string, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { providerOrderId: orderId },
      include: { booking: { include: { seats: true, show: true } } },
    });
    if (!payment || payment.provider !== PaymentProvider.RAZORPAY) {
      throw new NotFoundException('Razorpay order not found');
    }
    if (payment.providerPaymentId && payment.providerPaymentId !== paymentId) {
      throw new ConflictException(
        'A different payment is already linked to this order',
      );
    }
    if (
      payment.status === PaymentStatus.SUCCESS &&
      payment.booking.status === BookingStatus.CONFIRMED
    ) {
      return { bookingId: payment.bookingId, status: BookingStatus.CONFIRMED };
    }
    if (payment.providerRefundId) {
      return { bookingId: payment.bookingId, status: payment.booking.status };
    }

    const providerPayment = await this.razorpay.getPayment(paymentId);
    if (
      providerPayment.id !== paymentId ||
      providerPayment.order_id !== orderId ||
      providerPayment.status !== 'captured' ||
      providerPayment.currency !== 'INR' ||
      providerPayment.amount !== this.toPaise(payment.amount)
    ) {
      throw new ConflictException(
        'Razorpay payment is not captured or does not match this order',
      );
    }

    const booking = payment.booking;
    const ids = booking.seats.map((seat) => seat.showSeatId);
    try {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.booking.updateMany({
          where: {
            id: booking.id,
            status: BookingStatus.PENDING,
            expiresAt: { gt: new Date() },
          },
          data: { status: BookingStatus.CONFIRMED },
        });
        if (
          claimed.count !== 1 ||
          booking.show.status !== ShowStatus.SCHEDULED ||
          booking.show.startTime <= new Date()
        ) {
          throw new ConflictException(
            'Booking hold expired before payment confirmation',
          );
        }
        const booked = await tx.showSeat.updateMany({
          where: {
            id: { in: ids },
            showId: booking.showId,
            status: ShowSeatStatus.LOCKED,
            lockToken: booking.id,
          },
          data: {
            status: ShowSeatStatus.BOOKED,
            lockedUntil: null,
            lockToken: null,
            version: { increment: 1 },
          },
        });
        if (booked.count !== ids.length) {
          throw new ConflictException(
            'Seats are no longer reserved for this booking',
          );
        }
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.SUCCESS,
            providerPaymentId: paymentId,
            paidAt: new Date(),
          },
        });
      });
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
      const current = await this.prisma.booking.findUnique({
        where: { id: booking.id },
      });
      if (current?.status === BookingStatus.CONFIRMED) {
        return { bookingId: booking.id, status: BookingStatus.CONFIRMED };
      }
      await this.expireBooking(booking.id, BookingStatus.EXPIRED);
      const status = await this.refundUnfulfillablePayment(
        payment.id,
        paymentId,
      );
      return { bookingId: booking.id, status };
    }

    try {
      await this.redis.releaseSeatLocks(booking.showId, ids, booking.id);
    } catch {
      this.logger.warn(
        `Could not release locks for booking ${booking.id}; locks will expire`,
      );
    }
    await this.emails.sendConfirmation(booking.id);
    return { bookingId: booking.id, status: BookingStatus.CONFIRMED };
  }

  async markRefundProcessed(refundId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { providerRefundId: refundId },
    });
    if (!payment) return;
    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.REFUNDED },
      }),
      this.prisma.booking.update({
        where: { id: payment.bookingId },
        data: { status: BookingStatus.REFUNDED },
      }),
    ]);
  }

  private async refundUnfulfillablePayment(
    paymentId: string,
    providerPaymentId: string,
  ): Promise<BookingStatus> {
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    if (payment.providerRefundId || payment.status === PaymentStatus.REFUNDED)
      return payment.status === PaymentStatus.REFUNDED
        ? BookingStatus.REFUNDED
        : BookingStatus.EXPIRED;
    const claimed = await this.prisma.payment.updateMany({
      where: {
        id: paymentId,
        providerRefundId: null,
        status: { not: PaymentStatus.PROCESSING },
      },
      data: {
        providerPaymentId,
        status: PaymentStatus.PROCESSING,
        paidAt: new Date(),
      },
    });
    if (claimed.count === 0) return BookingStatus.EXPIRED;
    let refund: Awaited<ReturnType<RazorpayService['refund']>>;
    try {
      const amountPaise = this.toPaise(payment.amount);
      const existing = await this.razorpay.listRefunds(providerPaymentId);
      refund =
        existing.items?.find(
          (item) =>
            item.payment_id === providerPaymentId &&
            item.amount === amountPaise,
        ) ?? (await this.razorpay.refund(providerPaymentId, amountPaise));
      if (
        !refund.id ||
        refund.payment_id !== providerPaymentId ||
        refund.amount !== amountPaise
      ) {
        throw new ConflictException(
          'Razorpay refund response did not match payment',
        );
      }
    } catch (error) {
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.FAILED },
      });
      throw error;
    }
    const processed = refund.status === 'processed';
    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          providerRefundId: refund.id,
          status: processed ? PaymentStatus.REFUNDED : PaymentStatus.PROCESSING,
        },
      }),
      this.prisma.booking.update({
        where: { id: payment.bookingId },
        data: {
          status: processed ? BookingStatus.REFUNDED : BookingStatus.EXPIRED,
        },
      }),
    ]);
    return processed ? BookingStatus.REFUNDED : BookingStatus.EXPIRED;
  }

  private async expirePendingBookings() {
    const expired = await this.prisma.booking.findMany({
      where: { status: BookingStatus.PENDING, expiresAt: { lt: new Date() } },
      select: { id: true },
      take: 100,
    });
    for (const booking of expired)
      await this.expireBooking(booking.id, BookingStatus.EXPIRED);
  }

  private async runMaintenance() {
    await this.expirePendingBookings();
    const refunds = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.PROCESSING,
        providerRefundId: { not: null },
      },
      select: { providerRefundId: true },
      take: 100,
    });
    for (const payment of refunds) {
      const refund = await this.razorpay.getRefund(payment.providerRefundId);
      if (refund.status === 'processed') {
        await this.markRefundProcessed(refund.id);
      }
    }
    const unresolved = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.PROCESSING,
        providerRefundId: null,
        providerPaymentId: { not: null },
        updatedAt: { lt: new Date(Date.now() - 2 * 60_000) },
      },
      select: { id: true, providerPaymentId: true },
      take: 100,
    });
    for (const payment of unresolved) {
      await this.prisma.payment.updateMany({
        where: {
          id: payment.id,
          status: PaymentStatus.PROCESSING,
          providerRefundId: null,
        },
        data: { status: PaymentStatus.FAILED },
      });
      await this.refundUnfulfillablePayment(
        payment.id,
        payment.providerPaymentId,
      );
    }
  }

  private async expireBooking(
    id: string,
    status: BookingStatus,
  ): Promise<boolean> {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { seats: true },
    });
    if (!booking) return false;
    const changed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.booking.updateMany({
        where: { id, status: BookingStatus.PENDING },
        data: { status },
      });
      if (result.count === 0) return false;
      await tx.showSeat.updateMany({
        where: {
          id: { in: booking.seats.map((seat) => seat.showSeatId) },
          status: ShowSeatStatus.LOCKED,
          lockToken: id,
        },
        data: {
          status: ShowSeatStatus.AVAILABLE,
          lockedUntil: null,
          lockToken: null,
        },
      });
      await tx.payment.updateMany({
        where: { bookingId: id, status: PaymentStatus.INITIATED },
        data: { status: PaymentStatus.CANCELLED },
      });
      return true;
    });
    if (changed) {
      try {
        await this.redis.releaseSeatLocks(
          booking.showId,
          booking.seats.map((seat) => seat.showSeatId),
          id,
        );
      } catch {
        this.logger.warn(
          `Could not release locks for expired booking ${id}; locks will expire`,
        );
      }
    }
    return changed;
  }

  private toPaise(amount: Prisma.Decimal): number {
    const value = amount.mul(100);
    const paise = value.toNumber();
    if (!Number.isSafeInteger(paise) || paise < 100) {
      throw new BadRequestException(
        'Booking amount must be at least ₹1 and have two decimal places',
      );
    }
    return paise;
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
        payment: {
          select: {
            provider: true,
            providerOrderId: true,
            status: true,
            paidAt: true,
          },
        },
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
        payment: {
          select: {
            provider: true,
            providerOrderId: true,
            status: true,
            paidAt: true,
          },
        },
        show: { include: { movie: true, screen: true } },
      },
    });
    if (!booking) throw new NotFoundException(`Booking ${id} not found`);
    if (booking.userId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('You cannot access this booking');
    }
    return booking;
  }

  /** Cancel an unpaid checkout and return its seats to the pool. */
  async cancel(userId: string, id: string, role?: string) {
    const booking = await this.getOne(userId, id, role);
    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException(
        'Only unpaid pending bookings can be cancelled',
      );
    }
    if (!(await this.expireBooking(id, BookingStatus.CANCELLED))) {
      throw new ConflictException('Booking was already completed or cancelled');
    }
    return this.getOne(userId, id, role);
  }

  private async requireBookableShow(showId: string) {
    const show = await this.prisma.show.findUnique({ where: { id: showId } });
    if (!show) throw new NotFoundException(`Show ${showId} not found`);
    if (show.status !== ShowStatus.SCHEDULED) {
      throw new BadRequestException(
        `Show is ${show.status.toLowerCase()} and not open for booking`,
      );
    }
    if (show.startTime <= new Date()) {
      throw new BadRequestException('Show has already started');
    }
    return show;
  }
}
