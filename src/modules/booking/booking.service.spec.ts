import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  BookingStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  ShowSeatStatus,
  ShowStatus,
} from '@prisma/client';
import { BookingService } from './booking.service';

describe('Booking confirmation and verification', () => {
  let service: BookingService;
  let prisma: any;
  let redis: any;
  let emails: any;
  let tickets: any;
  let razorpay: any;
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
      totalAmount: new Prisma.Decimal(100),
      showId: 'show',
      seats: [{ seatRow: 'A', seatNumber: 1 }],
      show: {
        status: ShowStatus.SCHEDULED,
        startTime: new Date(Date.now() + 3600000),
        endTime: new Date(Date.now() + 3600000),
        movie: { title: 'Movie' },
        screen: { name: 'Screen', venue: { name: 'Venue', ownerId: 'owner' } },
      },
    };
    prisma = {
      booking: {
        findUnique: jest.fn().mockResolvedValue(booking),
        findMany: jest.fn().mockResolvedValue([]),
      },
      payment: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
      },
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
                status: ShowSeatStatus.LOCKED,
                lockToken: 'customer',
                lockedUntil: new Date(Date.now() + 60000),
                seat: { row: 'A', number: 1, category: 'REGULAR' },
              },
            ]),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          booking: { create: jest.fn().mockImplementation(({ data }) => data) },
        }),
      ),
    };
    redis = {
      transferSeatLocks: jest.fn().mockResolvedValue(true),
      releaseSeatLocks: jest.fn(),
    };
    emails = {
      sendConfirmation: jest.fn().mockResolvedValue({ status: 'sent' }),
    };
    tickets = { verify: jest.fn().mockReturnValue('booking') };
    razorpay = {
      createOrder: jest
        .fn()
        .mockResolvedValue({ id: 'order_1', amount: 10000, currency: 'INR' }),
      checkoutKeyId: 'rzp_test_key',
      getPayment: jest.fn().mockResolvedValue({
        id: 'pay_1',
        order_id: 'order_1',
        amount: 10000,
        currency: 'INR',
        status: 'captured',
      }),
      verifyCheckoutSignature: jest.fn(),
      listRefunds: jest.fn().mockResolvedValue({ items: [] }),
      refund: jest.fn(),
    };
    service = new BookingService(prisma, redis, emails, tickets, razorpay);
  });

  it('creates a pending booking and Razorpay order without issuing a ticket', async () => {
    const result = await service.createCheckout('customer', {
      showId: 'show',
      showSeatIds: ['seat'],
    });
    expect(result).toMatchObject({
      orderId: 'order_1',
      amount: 10000,
      keyId: 'rzp_test_key',
    });
    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: PaymentProvider.RAZORPAY,
          status: PaymentStatus.INITIATED,
        }),
      }),
    );
    expect(emails.sendConfirmation).not.toHaveBeenCalled();
  });

  it('does not create an order for a rolled back booking', async () => {
    prisma.$transaction.mockRejectedValue(new Error('Conflict'));
    await expect(
      service.createCheckout('customer', {
        showId: 'show',
        showSeatIds: ['seat'],
      }),
    ).rejects.toThrow('Conflict');
    expect(razorpay.createOrder).not.toHaveBeenCalled();
    expect(emails.sendConfirmation).not.toHaveBeenCalled();
  });

  it('confirms seats only after Razorpay reports a captured matching payment', async () => {
    booking.status = BookingStatus.PENDING;
    booking.expiresAt = new Date(Date.now() + 60000);
    prisma.payment.findUnique.mockResolvedValue({
      id: 'payment',
      bookingId: booking.id,
      booking,
      provider: PaymentProvider.RAZORPAY,
      providerOrderId: 'order_1',
      amount: new Prisma.Decimal(100),
      status: PaymentStatus.INITIATED,
    });
    const updateBooking = jest.fn().mockResolvedValue({ count: 1 });
    const updateSeats = jest.fn().mockResolvedValue({ count: 1 });
    const updatePayment = jest.fn();
    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        booking: { updateMany: updateBooking },
        showSeat: { updateMany: updateSeats },
        payment: { update: updatePayment },
      }),
    );

    await expect(
      service.processCapturedPayment('order_1', 'pay_1'),
    ).resolves.toMatchObject({ status: BookingStatus.CONFIRMED });
    expect(updateSeats).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          lockToken: booking.id,
          status: ShowSeatStatus.LOCKED,
        }),
        data: expect.objectContaining({ status: ShowSeatStatus.BOOKED }),
      }),
    );
    expect(updatePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PaymentStatus.SUCCESS,
          providerPaymentId: 'pay_1',
        }),
      }),
    );
    expect(emails.sendConfirmation).toHaveBeenCalledWith(booking.id);
  });

  it('rejects a captured payment with the wrong amount', async () => {
    booking.status = BookingStatus.PENDING;
    prisma.payment.findUnique.mockResolvedValue({
      id: 'payment',
      bookingId: booking.id,
      booking,
      provider: PaymentProvider.RAZORPAY,
      providerOrderId: 'order_1',
      amount: new Prisma.Decimal(100),
      status: PaymentStatus.INITIATED,
    });
    razorpay.getPayment.mockResolvedValue({
      id: 'pay_1',
      order_id: 'order_1',
      amount: 5000,
      currency: 'INR',
      status: 'captured',
    });
    await expect(
      service.processCapturedPayment('order_1', 'pay_1'),
    ).rejects.toThrow('does not match');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(emails.sendConfirmation).not.toHaveBeenCalled();
  });

  it('releases an expired hold and refunds a captured payment', async () => {
    booking.status = BookingStatus.PENDING;
    booking.expiresAt = new Date(Date.now() - 1000);
    const payment = {
      id: 'payment',
      bookingId: booking.id,
      booking,
      provider: PaymentProvider.RAZORPAY,
      providerOrderId: 'order_1',
      amount: new Prisma.Decimal(100),
      status: PaymentStatus.INITIATED,
    };
    prisma.payment.findUnique.mockResolvedValue(payment);
    prisma.payment.findUniqueOrThrow = jest.fn().mockResolvedValue(payment);
    prisma.payment.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    prisma.payment.update = jest.fn().mockResolvedValue({});
    prisma.booking.update = jest.fn().mockResolvedValue({});
    const releaseSeats = jest.fn().mockResolvedValue({ count: 1 });
    prisma.$transaction
      .mockImplementationOnce(async (callback) =>
        callback({
          booking: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        }),
      )
      .mockImplementationOnce(async (callback) =>
        callback({
          booking: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          showSeat: { updateMany: releaseSeats },
          payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        }),
      )
      .mockImplementationOnce(async (operations) => Promise.all(operations));
    razorpay.refund.mockResolvedValue({
      id: 'rfnd_1',
      payment_id: 'pay_1',
      amount: 10000,
      status: 'processed',
    });

    await expect(
      service.processCapturedPayment('order_1', 'pay_1'),
    ).resolves.toMatchObject({ status: BookingStatus.REFUNDED });
    expect(releaseSeats).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ lockToken: booking.id }),
        data: expect.objectContaining({ status: ShowSeatStatus.AVAILABLE }),
      }),
    );
    expect(razorpay.refund).toHaveBeenCalledWith('pay_1', 10000);
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
