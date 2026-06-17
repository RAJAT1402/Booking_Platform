import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
} from 'class-validator';

// Shared by lock / unlock / confirm — a set of show seats the user is acting on.
export class SeatSelectionDto {
  @IsString()
  showId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsString({ each: true })
  showSeatIds: string[];
}
