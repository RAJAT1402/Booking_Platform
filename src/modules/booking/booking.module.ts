import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { BookingEmailService } from './booking-email.service';
import { BookingTicketService } from './booking-ticket.service';

@Module({
  controllers: [BookingController],
  providers: [BookingService, BookingEmailService, BookingTicketService],
  exports: [BookingService],
})
export class BookingModule {}
