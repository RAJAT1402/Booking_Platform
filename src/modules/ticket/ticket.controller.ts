import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { TicketService } from './ticket.service';

@Controller('tickets')
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  // The ticket to encode into a QR code. Owner (or ADMIN) only.
  @Get('booking/:bookingId')
  @ResponseMessage('Ticket fetched')
  getByBooking(
    @CurrentUser() user: AuthUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.ticketService.getByBooking(user.id, bookingId, user.role);
  }

  // Retry path: confirming a booking already issues its ticket, so this is
  // only needed if that step failed. Idempotent — never mints a second code.
  @Post('booking/:bookingId')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Ticket issued')
  issue(
    @CurrentUser() user: AuthUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.ticketService.issue(user.id, bookingId, user.role);
  }
}
