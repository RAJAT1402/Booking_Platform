import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BookingStatus, Prisma, ShowStatus } from '@prisma/client';
import { BookingService } from './booking.service';

describe('Booking confirmation and verification', () => {
  let service: BookingService;
  let prisma: any;
  let redis: any;
  let emails: any;
  let tickets: any;
  let booking: any;
  const owner = {
    id: 'owner',
    email: 'owner@example.com',
    role: 'THEATRE_OWNER',
  };

  beforeEach(() => {
    booking = {
      id: 'booking',
      userId: 'customer',
      status: BookingStatus.CONFIRMED,
      seats: [{ seatRow: 'A', seatNumber: 1 }],
      show: {
        status: ShowStatus.SCHEDULED,
        endTime: new Date(Date.now() + 3600000),
        movie: { title: 'Movie' },
        screen: { name: 'Screen', venue: { name: 'Venue', ownerId: 'owner' } },
      },
    };
    prisma = {
      booking: { findUnique: jest.fn().mockResolvedValue(booking) },
      show: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: ShowStatus.SCHEDULED }),
      },
      $transaction: jest.fn(async (callback) =>
        callback({
          showSeat: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: 'seat',
                price: new Prisma.Decimal(100),
                seat: { row: 'A', number: 1 },
              },
            ]),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          booking: { create: jest.fn().mockResolvedValue(booking) },
        }),
      ),
    };
    redis = {
      getSeatLockHolders: jest.fn().mockResolvedValue(['customer']),
      releaseSeatLocks: jest.fn(),
    };
    emails = {
      sendConfirmation: jest.fn().mockResolvedValue({ status: 'sent' }),
    };
    tickets = { verify: jest.fn().mockReturnValue('booking') };
    service = new BookingService(prisma, redis, emails, tickets);
  });

  it('sends after transaction commit and preserves confirmation on email/lock failure', async () => {
    emails.sendConfirmation.mockImplementation(async () => {
      expect(prisma.$transaction).toHaveBeenCalled();
      return { status: 'failed' };
    });
    redis.releaseSeatLocks.mockRejectedValue(new Error('Redis unavailable'));
    const result = await service.confirm('customer', {
      showId: 'show',
      showSeatIds: ['seat'],
    });
    expect(result.status).toBe(BookingStatus.CONFIRMED);
    expect(result.confirmationEmail.status).toBe('failed');
    expect(emails.sendConfirmation).toHaveBeenCalledWith('booking');
  });

  it('does not email a rolled back booking', async () => {
    prisma.$transaction.mockRejectedValue(new Error('Conflict'));
    await expect(
      service.confirm('customer', { showId: 'show', showSeatIds: ['seat'] }),
    ).rejects.toThrow('Conflict');
    expect(emails.sendConfirmation).not.toHaveBeenCalled();
  });

  it('verifies a live ticket for its venue owner', async () => {
    await expect(
      service.verifyTicket(owner, 'signed-token'),
    ).resolves.toMatchObject({ valid: true, bookingId: 'booking' });
  });

  it('rejects customers and owners of other venues', async () => {
    await expect(
      service.verifyTicket({ ...owner, role: 'USER' }, 'token'),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.verifyTicket({ ...owner, id: 'other' }, 'token'),
    ).rejects.toThrow(ForbiddenException);
  });

  it.each([
    BookingStatus.CANCELLED,
    BookingStatus.PENDING,
    BookingStatus.REFUNDED,
  ])('rejects %s bookings', async (status) => {
    booking.status = status;
    await expect(service.verifyTicket(owner, 'token')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects cancelled and ended shows', async () => {
    booking.show.status = ShowStatus.CANCELLED;
    await expect(service.verifyTicket(owner, 'token')).rejects.toThrow(
      BadRequestException,
    );
    booking.show.status = ShowStatus.SCHEDULED;
    booking.show.endTime = new Date(0);
    await expect(service.verifyTicket(owner, 'token')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('allows only the booking owner or admin to resend and rejects cancelled bookings', async () => {
    await expect(
      service.resendConfirmation('other', 'booking', 'USER'),
    ).rejects.toThrow(ForbiddenException);
    booking.status = BookingStatus.CANCELLED;
    await expect(
      service.resendConfirmation('customer', 'booking', 'USER'),
    ).rejects.toThrow(BadRequestException);
    expect(emails.sendConfirmation).not.toHaveBeenCalled();
  });
});
