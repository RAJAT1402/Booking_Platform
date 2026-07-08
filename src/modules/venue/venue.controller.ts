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
import { CreateVenueDto } from './dto/create-venue.dto';
import { FindVenuesQueryDto } from './dto/find-venues-query.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { VenueService } from './venue.service';

@Controller('venues')
export class VenueController {
  constructor(private readonly venueService: VenueService) {}

  @Post()
  @ResponseMessage('Venue created')
  create(@Body() dto: CreateVenueDto) {
    return this.venueService.create(dto);
  }

  @Public()
  @Get()
  @ResponseMessage('Venues fetched')
  findAll(@Query() query: FindVenuesQueryDto) {
    return this.venueService.findAll(query);
  }

  @Public()
  @Get('slug/:slug')
  @ResponseMessage('Venue fetched')
  findBySlug(@Param('slug') slug: string) {
    return this.venueService.findBySlug(slug);
  }

  @Public()
  @Get(':id')
  @ResponseMessage('Venue fetched')
  findOne(@Param('id') id: string) {
    return this.venueService.findOne(id);
  }

  @Patch(':id')
  @ResponseMessage('Venue updated')
  update(@Param('id') id: string, @Body() dto: UpdateVenueDto) {
    return this.venueService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ResponseMessage('Venue deleted')
  remove(@Param('id') id: string) {
    return this.venueService.remove(id);
  }
}


