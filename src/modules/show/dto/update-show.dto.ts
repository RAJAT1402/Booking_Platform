import { ShowStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

// Note: screenId is intentionally not updatable — show seats are generated from
// the screen at creation time, so changing the screen would orphan them.
export class UpdateShowDto {
  @IsOptional()
  @IsString()
  movieId?: string;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice?: number;

  @IsOptional()
  @IsEnum(ShowStatus)
  status?: ShowStatus;
}
