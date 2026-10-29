import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { BookingService } from './booking.service';
import { SeatSelectionDto } from './dto/seat-selection.dto';
import { VerifyBookingDto } from './dto/verify-booking.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';

@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  // Hold the selected seats for 2 minutes.
  @Post('lock')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Seats locked')
  lock(@CurrentUser() user: AuthUser, @Body() dto: SeatSelectionDto) {
    return this.bookingService.lockSeats(user.id, dto);
  }

  // Release a hold early.
  @Post('unlock')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Seats released')
  unlock(@CurrentUser() user: AuthUser, @Body() dto: SeatSelectionDto) {
    return this.bookingService.releaseSeats(user.id, dto);
  }

  // Create a pending booking and Razorpay order from held seats.
  @Post()
  @ResponseMessage('Checkout created')
  createCheckout(@CurrentUser() user: AuthUser, @Body() dto: SeatSelectionDto) {
    return this.bookingService.createCheckout(user.id, dto);
  }

  @Post(':id/verify-payment')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Payment verified')
  verifyPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: VerifyPaymentDto,
  ) {
    return this.bookingService.verifyPayment(
      user.id,
      id,
      dto.razorpay_order_id,
      dto.razorpay_payment_id,
      dto.razorpay_signature,
    );
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Booking verified')
  verify(@CurrentUser() user: AuthUser, @Body() dto: VerifyBookingDto) {
    return this.bookingService.verifyTicket(user, dto.token);
  }

  @Post(':id/confirmation-email')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Confirmation email processed')
  resendConfirmation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookingService.resendConfirmation(user.id, id, user.role);
  }

  @Get()
  @ResponseMessage('Bookings fetched')
  findMine(@CurrentUser() user: AuthUser) {
    return this.bookingService.findMine(user.id);
  }

  @Get(':id')
  @ResponseMessage('Booking fetched')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookingService.getOne(user.id, id, user.role);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Booking cancelled')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookingService.cancel(user.id, id, user.role);
  }
}
