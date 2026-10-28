import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingStatus, Prisma } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';
import { BookingTicketService } from './booking-ticket.service';

type EmailBooking = Prisma.BookingGetPayload<{
  include: {
    user: true;
    seats: true;
    show: { include: { movie: true; screen: { include: { venue: true } } } };
  };
}>;

@Injectable()
export class BookingEmailService {
  private readonly logger = new Logger(BookingEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tickets: BookingTicketService,
  ) {}

  async sendConfirmation(id: string): Promise<{ status: 'sent' | 'failed' }> {
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id },
        include: {
          user: true,
          seats: true,
          show: {
            include: { movie: true, screen: { include: { venue: true } } },
          },
        },
      });
      if (!booking || booking.status !== BookingStatus.CONFIRMED) {
        throw new Error('Booking is not confirmed');
      }
      await this.deliver(booking);
      return { status: 'sent' };
    } catch {
      // Do not expose credentials, recipient addresses, or ticket tokens in logs.
      this.logger.error(
        `Confirmation email failed for booking ${id}; retry using the confirmation-email endpoint`,
      );
      return { status: 'failed' };
    }
  }

  private async deliver(booking: EmailBooking) {
    const host = this.config.getOrThrow<string>('SMTP_HOST');
    const from = this.config.getOrThrow<string>('SMTP_FROM');
    const user = this.config.get<string>('SMTP_USER');
    const transporter = nodemailer.createTransport({
      host,
      port: Number(this.config.get<string>('SMTP_PORT') ?? '587'),
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
      auth: user
        ? { user, pass: this.config.getOrThrow<string>('SMTP_PASSWORD') }
        : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    const qr = await QRCode.toBuffer(this.tickets.create(booking.id), {
      type: 'png',
      width: 400,
      margin: 4,
      errorCorrectionLevel: 'M',
    });
    const seats = booking.seats
      .map((seat) => `${seat.seatRow}${seat.seatNumber}`)
      .join(', ');
    const time = booking.show.startTime.toLocaleString('en-IN', {
      timeZone: this.config.get<string>('BOOKING_TIMEZONE') ?? 'Asia/Kolkata',
      dateStyle: 'full',
      timeStyle: 'short',
    });
    const timezone =
      this.config.get<string>('BOOKING_TIMEZONE') ?? 'Asia/Kolkata';
    const text = [
      `Hi ${booking.user.name},`,
      'Your booking is confirmed!',
      `Booking ID: ${booking.id}`,
      `Movie: ${booking.show.movie.title}`,
      `Venue: ${booking.show.screen.venue.name} — ${booking.show.screen.name}`,
      `Show: ${time} (${timezone})`,
      `Seats: ${seats}`,
      `Total amount: ${booking.totalAmount.toFixed(2)}`,
      'Present the attached QR code at the venue for booking verification.',
    ].join('\n');
    const html =
      text
        .split('\n')
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join('') +
      '<img src="cid:booking-qr" width="400" height="400" alt="Booking verification QR code" />';
    const result = await transporter.sendMail({
      from,
      to: booking.user.email,
      subject: `Booking confirmed — ${booking.id}`,
      text,
      html,
      attachments: [
        {
          filename: `booking-${booking.id}.png`,
          content: qr,
          cid: 'booking-qr',
          contentType: 'image/png',
        },
      ],
    });
    if (!result.accepted?.length)
      throw new Error('SMTP did not accept the recipient');
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character],
  );
}
