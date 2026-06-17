import { ShowStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class FindShowsQueryDto {
  @IsOptional()
  @IsString()
  movieId?: string;

  @IsOptional()
  @IsString()
  screenId?: string;

  @IsOptional()
  @IsEnum(ShowStatus)
  status?: ShowStatus;

  // Inclusive lower / upper bounds on startTime.
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
