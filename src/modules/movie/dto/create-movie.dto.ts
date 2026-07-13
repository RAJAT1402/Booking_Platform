import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateMovieDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase, alphanumeric, and use hyphens as separators',
  })
  slug?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  language: string;

  @IsInt()
  @Min(1)
  durationMin: number;

  @IsDateString()
  releaseDate: string;

  @IsOptional()
  @IsUrl()
  posterUrl?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  rating?: number;

  @IsArray()
  @IsString({ each: true })
  genre: string[];

  @IsOptional()
  @IsBoolean()
  isRecommended?: boolean;
}
