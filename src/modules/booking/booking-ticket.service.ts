import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

@Injectable()
export class BookingTicketService {
  constructor(private readonly config: ConfigService) {}

  create(bookingId: string): string {
    const payload = Buffer.from(JSON.stringify({ v: 1, bookingId })).toString(
      'base64url',
    );
    return `${payload}.${this.sign(payload)}`;
  }

  verify(token: string): string {
    const parts = token.split('.');
    if (parts.length !== 2)
      throw new BadRequestException('Invalid booking QR code');
    const [payload, signature] = parts;
    const expected = Buffer.from(this.sign(payload));
    const actual = Buffer.from(signature);
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw new BadRequestException('Invalid booking QR code');
    }
    try {
      const data = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      );
      if (
        data.v !== 1 ||
        typeof data.bookingId !== 'string' ||
        !data.bookingId
      ) {
        throw new Error('Invalid payload');
      }
      return data.bookingId;
    } catch {
      throw new BadRequestException('Invalid booking QR code');
    }
  }

  private sign(payload: string): string {
    const secret = this.config.getOrThrow<string>('BOOKING_QR_SECRET');
    if (Buffer.byteLength(secret) < 32) {
      throw new Error('BOOKING_QR_SECRET must contain at least 32 bytes');
    }
    return createHmac('sha256', secret)
      .update(`booking-ticket:${payload}`)
      .digest('base64url');
  }
}
