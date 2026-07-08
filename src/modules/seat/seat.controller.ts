import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { BulkCreateSeatsDto } from './dto/bulk-create-seats.dto';
import { CreateSeatDto } from './dto/create-seat.dto';
import { FindSeatsQueryDto } from './dto/find-seats-query.dto';
import { UpdateSeatDto } from './dto/update-seat.dto';
import { SeatService } from './seat.service';

@Controller('seats')
export class SeatController {
  constructor(private readonly seatService: SeatService) {}

  @Post()
  @ResponseMessage('Seat created')
  create(@Body() dto: CreateSeatDto) {
    return this.seatService.create(dto);
  }

  @Post('bulk')
  @ResponseMessage('Seats created')
  bulkCreate(@Body() dto: BulkCreateSeatsDto) {
    return this.seatService.bulkCreate(dto);
  }

  @Public()
  @Get()
  @ResponseMessage('Seats fetched')
  findAll(@Query() query: FindSeatsQueryDto) {
    return this.seatService.findAll(query);
  }

  @Public()
  @Get(':id')
  @ResponseMessage('Seat fetched')
  findOne(@Param('id') id: string) {
    return this.seatService.findOne(id);
  }

  @Patch(':id')
  @ResponseMessage('Seat updated')
  update(@Param('id') id: string, @Body() dto: UpdateSeatDto) {
    return this.seatService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ResponseMessage('Seat deleted')
  remove(@Param('id') id: string) {
    return this.seatService.remove(id);
  }
}
