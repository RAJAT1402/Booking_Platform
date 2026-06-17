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
import { CreateScreenDto } from './dto/create-screen.dto';
import { FindScreensQueryDto } from './dto/find-screens-query.dto';
import { UpdateScreenDto } from './dto/update-screen.dto';
import { ScreenService } from './screen.service';

@Controller('screens')
export class ScreenController {
  constructor(private readonly screenService: ScreenService) {}

  @Post()
  create(@Body() dto: CreateScreenDto) {
    return this.screenService.create(dto);
  }

  @Public()
  @Get()
  findAll(@Query() query: FindScreensQueryDto) {
    return this.screenService.findAll(query);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.screenService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateScreenDto) {
    return this.screenService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.screenService.remove(id);
  }
}
