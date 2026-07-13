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
import { CreateMovieDto } from './dto/create-movie.dto';
import { FindMoviesQueryDto } from './dto/find-movies-query.dto';
import { UpdateMovieDto } from './dto/update-movie.dto';
import { MovieService } from './movie.service';

@Controller('movies')
export class MovieController {
  constructor(private readonly movieService: MovieService) {}

  @Post()
  @ResponseMessage('Movie created')
  create(@Body() dto: CreateMovieDto) {
    return this.movieService.create(dto);
  }

  @Public()
  @Get()
  @ResponseMessage('Movies fetched')
  findAll(@Query() query: FindMoviesQueryDto) {
    return this.movieService.findAll(query);
  }

  @Public()
  @Get('recommended')
  @ResponseMessage('Recommended movies fetched')
  findRecommended() {
    return this.movieService.findRecommended();
  }

  @Public()
  @Get('slug/:slug')
  @ResponseMessage('Movie fetched')
  findBySlug(@Param('slug') slug: string) {
    return this.movieService.findBySlug(slug);
  }

  @Public()
  @Get(':id')
  @ResponseMessage('Movie fetched')
  findOne(@Param('id') id: string) {
    return this.movieService.findOne(id);
  }

  @Patch(':id')
  @ResponseMessage('Movie updated')
  update(@Param('id') id: string, @Body() dto: UpdateMovieDto) {
    return this.movieService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ResponseMessage('Movie deleted')
  remove(@Param('id') id: string) {
    return this.movieService.remove(id);
  }
}
