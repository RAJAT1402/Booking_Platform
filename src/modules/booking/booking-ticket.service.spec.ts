import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingTicketService } from './booking-ticket.service';

describe('BookingTicketService', () => {
  const tickets = new BookingTicketService(
    new ConfigService({
      BOOKING_QR_SECRET: 'test-secret-with-at-least-32-bytes-long',
    }),
  );

  it('round trips a signed booking ID', () => {
    expect(tickets.verify(tickets.create('booking-123'))).toBe('booking-123');
  });

  it('rejects a substituted ID, malformed code, and a different signing key', () => {
    const token = tickets.create('booking-123');
    const payload = Buffer.from(
      JSON.stringify({ v: 1, bookingId: 'another-id' }),
    ).toString('base64url');
    expect(() => tickets.verify(`${payload}.${token.split('.')[1]}`)).toThrow(
      BadRequestException,
    );
    expect(() => tickets.verify('booking-123')).toThrow(BadRequestException);
    const other = new BookingTicketService(
      new ConfigService({
        BOOKING_QR_SECRET: 'other-secret-with-at-least-32-bytes-long',
      }),
    );
    expect(() => other.verify(token)).toThrow(BadRequestException);
  });
});
