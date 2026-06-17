import { IsOptional, IsString } from 'class-validator';

export class FindScreensQueryDto {
  @IsOptional()
  @IsString()
  venueId?: string;
}
