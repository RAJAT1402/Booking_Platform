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
import { BulkCreateSeatsDto } from './dto/bulk-create-seats.dto';
import { CreateSeatDto } from './dto/create-seat.dto';
import { FindSeatsQueryDto } from './dto/find-seats-query.dto';
import { UpdateSeatDto } from './dto/update-seat.dto';
import { SeatService } from './seat.service';

@Controller('seats')
export class SeatController {
  constructor(private readonly seatService: SeatService) {}

  @Post()
  create(@Body() dto: CreateSeatDto) {
    return this.seatService.create(dto);
  }

  @Post('bulk')
  bulkCreate(@Body() dto: BulkCreateSeatsDto) {
    return this.seatService.bulkCreate(dto);
  }

  @Public()
  @Get()
  findAll(@Query() query: FindSeatsQueryDto) {
    return this.seatService.findAll(query);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.seatService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSeatDto) {
    return this.seatService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.seatService.remove(id);
  }
}
