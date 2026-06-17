import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class FindMoviesQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  genre?: string;
}
