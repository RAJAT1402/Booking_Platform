import { SeatCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class BulkSeatItem {
  @IsString()
  @Matches(/^[A-Z]{1,2}$/, {
    message: 'row must be 1-2 uppercase letters (e.g. "A", "AA")',
  })
  row: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  number: number;

  @IsOptional()
  @IsEnum(SeatCategory)
  category?: SeatCategory;
}

export class BulkCreateSeatsDto {
  @IsString()
  screenId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => BulkSeatItem)
  seats: BulkSeatItem[];
}
