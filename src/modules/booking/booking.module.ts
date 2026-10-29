import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { BookingEmailService } from './booking-email.service';
import { BookingTicketService } from './booking-ticket.service';
import { RazorpayService } from './razorpay.service';
import { RazorpayWebhookController } from './razorpay-webhook.controller';

@Module({
  controllers: [BookingController, RazorpayWebhookController],
  providers: [
    BookingService,
    BookingEmailService,
    BookingTicketService,
    RazorpayService,
  ],
  exports: [BookingService],
})
export class BookingModule {}
