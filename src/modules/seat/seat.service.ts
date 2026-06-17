import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BulkCreateSeatsDto } from './dto/bulk-create-seats.dto';
import { CreateSeatDto } from './dto/create-seat.dto';
import { FindSeatsQueryDto } from './dto/find-seats-query.dto';
import { UpdateSeatDto } from './dto/update-seat.dto';

function isUniqueConstraintError(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code: unknown }).code === 'P2002'
  );
}

function isForeignKeyError(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code: unknown }).code === 'P2003'
  );
}

@Injectable()
export class SeatService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSeatDto) {
    await this.assertScreenExists(dto.screenId);

    try {
      return await this.prisma.seat.create({
        data: {
          row: dto.row,
          number: dto.number,
          category: dto.category,
          screenId: dto.screenId,
        },
      });
    } catch (e) {
      if (isUniqueConstraintError(e)) {
        throw new ConflictException(
          `Seat ${dto.row}${dto.number} already exists on screen ${dto.screenId}`,
        );
      }
      throw e;
    }
  }

  async bulkCreate(dto: BulkCreateSeatsDto) {
    await this.assertScreenExists(dto.screenId);

    const result = await this.prisma.seat.createMany({
      data: dto.seats.map((s) => ({
        row: s.row,
        number: s.number,
        category: s.category,
        screenId: dto.screenId,
      })),
      skipDuplicates: true,
    });

    return { created: result.count, requested: dto.seats.length };
  }

  findAll(query: FindSeatsQueryDto) {
    const where: Record<string, unknown> = {};
    if (query.screenId) where.screenId = query.screenId;
    if (query.category) where.category = query.category;

    return this.prisma.seat.findMany({
      where,
      orderBy: [{ row: 'asc' }, { number: 'asc' }],
    });
  }

  async findOne(id: string) {
    const seat = await this.prisma.seat.findUnique({ where: { id } });
    if (!seat) throw new NotFoundException(`Seat ${id} not found`);
    return seat;
  }

  async update(id: string, dto: UpdateSeatDto) {
    await this.findOne(id);

    try {
      return await this.prisma.seat.update({
        where: { id },
        data: dto,
      });
    } catch (e) {
      if (isUniqueConstraintError(e)) {
        throw new ConflictException(
          `A seat with that row/number already exists on this screen`,
        );
      }
      throw e;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    try {
      return await this.prisma.seat.delete({ where: { id } });
    } catch (e) {
      if (isForeignKeyError(e)) {
        throw new ConflictException(
          `Seat ${id} is referenced by existing shows; remove those first`,
        );
      }
      throw e;
    }
  }

  private async assertScreenExists(screenId: string): Promise<void> {
    const screen = await this.prisma.screen.findUnique({
      where: { id: screenId },
    });
    if (!screen) throw new NotFoundException(`Screen ${screenId} not found`);
  }
}
