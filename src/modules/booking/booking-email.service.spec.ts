import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { BookingEmailService } from './booking-email.service';
import { BookingTicketService } from './booking-ticket.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('BookingEmailService', () => {
  const config = new ConfigService({
    SMTP_HOST: 'smtp.example.com',
    SMTP_FROM: 'bookings@example.com',
    BOOKING_QR_SECRET: 'test-secret-with-at-least-32-bytes-long',
  });
  let sendMail: jest.Mock;
  let prisma: any;
  let service: BookingEmailService;

  beforeEach(() => {
    sendMail = jest
      .fn()
      .mockResolvedValue({ accepted: ['customer@example.com'] });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    prisma = {
      booking: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'booking-123',
          status: 'CONFIRMED',
          totalAmount: new Prisma.Decimal(100),
          user: { name: '<Customer>', email: 'customer@example.com' },
          seats: [{ seatRow: 'A', seatNumber: 1 }],
          show: {
            startTime: new Date('2027-01-01T12:00:00Z'),
            movie: { title: 'Movie & title' },
            screen: { name: 'Screen', venue: { name: 'Venue' } },
          },
        }),
      },
    };
    service = new BookingEmailService(
      prisma,
      config,
      new BookingTicketService(config),
    );
  });

  it('emails the registered account with escaped HTML and a real PNG QR attachment', async () => {
    await expect(service.sendConfirmation('booking-123')).resolves.toEqual({
      status: 'sent',
    });
    const message = sendMail.mock.calls[0][0];
    expect(message.to).toBe('customer@example.com');
    expect(message.text).toContain('Booking ID: booking-123');
    expect(message.html).toContain('&lt;Customer&gt;');
    expect(message.html).toContain('cid:booking-qr');
    expect(message.attachments[0].content.subarray(0, 8).toString('hex')).toBe(
      '89504e470d0a1a0a',
    );
  });

  it('reports SMTP failures without throwing or claiming delivery', async () => {
    sendMail.mockRejectedValue(new Error('SMTP unavailable'));
    await expect(service.sendConfirmation('booking-123')).resolves.toEqual({
      status: 'failed',
    });
  });

  it('does not send email for unconfirmed bookings', async () => {
    prisma.booking.findUnique.mockResolvedValue({ status: 'PENDING' });
    await expect(service.sendConfirmation('booking-123')).resolves.toEqual({
      status: 'failed',
    });
    expect(sendMail).not.toHaveBeenCalled();
  });
});
