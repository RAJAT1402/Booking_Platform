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
import { CreateVenueDto } from './dto/create-venue.dto';
import { FindVenuesQueryDto } from './dto/find-venues-query.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { VenueService } from './venue.service';

@Controller('venues')
export class VenueController {
  constructor(private readonly venueService: VenueService) {}

  @Post()
  create(@Body() dto: CreateVenueDto) {
    return this.venueService.create(dto);
  }

  @Get()
  findAll(@Query() query: FindVenuesQueryDto) {
    return this.venueService.findAll(query);
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.venueService.findBySlug(slug);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.venueService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateVenueDto) {
    return this.venueService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.venueService.remove(id);
  }
}
