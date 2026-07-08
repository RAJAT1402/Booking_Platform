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
import { CreateScreenDto } from './dto/create-screen.dto';
import { FindScreensQueryDto } from './dto/find-screens-query.dto';
import { UpdateScreenDto } from './dto/update-screen.dto';
import { ScreenService } from './screen.service';

@Controller('screens')
export class ScreenController {
  constructor(private readonly screenService: ScreenService) {}

  @Post()
  @ResponseMessage('Screen created')
  create(@Body() dto: CreateScreenDto) {
    return this.screenService.create(dto);
  }

  @Public()
  @Get()
  @ResponseMessage('Screens fetched')
  findAll(@Query() query: FindScreensQueryDto) {
    return this.screenService.findAll(query);
  }

  @Public()
  @Get(':id')
  @ResponseMessage('Screen fetched')
  findOne(@Param('id') id: string) {
    return this.screenService.findOne(id);
  }

  @Patch(':id')
  @ResponseMessage('Screen updated')
  update(@Param('id') id: string, @Body() dto: UpdateScreenDto) {
    return this.screenService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ResponseMessage('Screen deleted')
  remove(@Param('id') id: string) {
    return this.screenService.remove(id);
  }
}
