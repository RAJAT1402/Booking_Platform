import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateCityDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  state: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase, alphanumeric, and use hyphens as separators',
  })
  slug?: string;
}