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
import { CreateShowDto } from './dto/create-show.dto';
import { FindShowsQueryDto } from './dto/find-shows-query.dto';
import { UpdateShowDto } from './dto/update-show.dto';
import { ShowService } from './show.service';

@Controller('shows')
export class ShowController {
  constructor(private readonly showService: ShowService) {}

  @Post()
  create(@Body() dto: CreateShowDto) {
    return this.showService.create(dto);
  }

  @Public()
  @Get()
  findAll(@Query() query: FindShowsQueryDto) {
    return this.showService.findAll(query);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.showService.findOne(id);
  }

  @Public()
  @Get(':id/seats')
  getSeatMap(@Param('id') id: string) {
    return this.showService.getSeatMap(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateShowDto) {
    return this.showService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.showService.remove(id);
  }
}
