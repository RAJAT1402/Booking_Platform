import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateScreenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsInt()
  @Min(1)
  @Max(2000)
  totalSeats: number;

  @IsString()
  venueId: string;
}
