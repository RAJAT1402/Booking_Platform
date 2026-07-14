import { IsDateString, IsOptional, IsString } from 'class-validator';

export class FindShowtimesQueryDto {
  // Only show cinemas in this city.
  @IsOptional()
  @IsString()
  cityId?: string;

  // Restrict to a single calendar day (YYYY-MM-DD). Omit for all upcoming shows.
  @IsOptional()
  @IsDateString()
  date?: string;
}
