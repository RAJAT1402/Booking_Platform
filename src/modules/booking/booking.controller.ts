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
  unlock(@CurrentUser() user: AuthUser, @Body() dto: SeatSelectionDto) {
    return this.bookingService.releaseSeats(user.id, dto);
  }

  // Convert held seats into a confirmed booking.
  @Post()
  confirm(@CurrentUser() user: AuthUser, @Body() dto: SeatSelectionDto) {
    return this.bookingService.confirm(user.id, dto);
  }

  @Get()
  findMine(@CurrentUser() user: AuthUser) {
    return this.bookingService.findMine(user.id);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookingService.getOne(user.id, id, user.role);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookingService.cancel(user.id, id, user.role);
  }
}
