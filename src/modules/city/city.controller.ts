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
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { CityService } from './city.service';
import { CreateCityDto } from './dto/create-city.dto';
import { UpdateCityDto } from './dto/update-city.dto';

@Controller('cities')
export class CityController {
  constructor(private readonly cityService: CityService) {}

  @Post()
  @ResponseMessage('City created')
  create(@Body() dto: CreateCityDto) {
    return this.cityService.create(dto);
  }

  @Public()
  @Get()
  @ResponseMessage('Cities fetched')
  findAll() {
    return this.cityService.findAll();
  }

  @Public()
  @Get('slug/:slug')
  @ResponseMessage('City fetched')
  findBySlug(@Param('slug') slug: string) {
    return this.cityService.findBySlug(slug);
  }

  @Public()
  @Get(':id')
  @ResponseMessage('City fetched')
  findOne(@Param('id') id: string) {
    return this.cityService.findOne(id);
  }

  @Patch(':id')
  @ResponseMessage('City updated')
  update(@Param('id') id: string, @Body() dto: UpdateCityDto) {
    return this.cityService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ResponseMessage('City deleted')
  remove(@Param('id') id: string) {
    return this.cityService.remove(id);
  }
}
