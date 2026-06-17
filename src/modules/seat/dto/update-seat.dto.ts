import { SeatCategory } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class UpdateSeatDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{1,2}$/, {
    message: 'row must be 1-2 uppercase letters (e.g. "A", "AA")',
  })
  row?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  number?: number;

  @IsOptional()
  @IsEnum(SeatCategory)
  category?: SeatCategory;
}
