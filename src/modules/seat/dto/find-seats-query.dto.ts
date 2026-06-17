import { SeatCategory } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class FindSeatsQueryDto {
  @IsOptional()
  @IsString()
  screenId?: string;

  @IsOptional()
  @IsEnum(SeatCategory)
  category?: SeatCategory;
}
