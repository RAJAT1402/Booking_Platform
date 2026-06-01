import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class FindVenuesQueryDto {
  @IsOptional()
  @IsString()
  cityId?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q?: string;
}
