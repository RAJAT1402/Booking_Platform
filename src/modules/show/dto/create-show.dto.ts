import { ShowStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateShowDto {
  @IsString()
  movieId: string;

  @IsString()
  screenId: string;

  @IsDateString()
  startTime: string;

  // Optional: if omitted, computed from startTime + movie duration.
  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice: number;

  @IsOptional()
  @IsEnum(ShowStatus)
  status?: ShowStatus;
}
