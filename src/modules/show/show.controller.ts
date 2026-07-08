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
import { CreateShowDto } from './dto/create-show.dto';
import { FindShowsQueryDto } from './dto/find-shows-query.dto';
import { UpdateShowDto } from './dto/update-show.dto';
import { ShowService } from './show.service';

@Controller('shows')
export class ShowController {
  constructor(private readonly showService: ShowService) {}

  @Post()
  @ResponseMessage('Show created')
  create(@Body() dto: CreateShowDto) {
    return this.showService.create(dto);
  }

  @Public()
  @Get()
  @ResponseMessage('Shows fetched')
  findAll(@Query() query: FindShowsQueryDto) {
    return this.showService.findAll(query);
  }

  @Public()
  @Get(':id')
  @ResponseMessage('Show fetched')
  findOne(@Param('id') id: string) {
    return this.showService.findOne(id);
  }

  @Public()
  @Get(':id/seats')
  @ResponseMessage('Seat map fetched')
  getSeatMap(@Param('id') id: string) {
    return this.showService.getSeatMap(id);
  }

  @Patch(':id')
  @ResponseMessage('Show updated')
  update(@Param('id') id: string, @Body() dto: UpdateShowDto) {
    return this.showService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ResponseMessage('Show deleted')
  remove(@Param('id') id: string) {
    return this.showService.remove(id);
  }
}
