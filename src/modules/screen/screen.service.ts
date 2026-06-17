import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateScreenDto } from './dto/create-screen.dto';
import { FindScreensQueryDto } from './dto/find-screens-query.dto';
import { UpdateScreenDto } from './dto/update-screen.dto';

function isForeignKeyError(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code: unknown }).code === 'P2003'
  );
}

@Injectable()
export class ScreenService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateScreenDto) {
    await this.assertVenueExists(dto.venueId);

    return this.prisma.screen.create({
      data: {
        name: dto.name,
        totalSeats: dto.totalSeats,
        venueId: dto.venueId,
      },
      include: { venue: true },
    });
  }

  findAll(query: FindScreensQueryDto) {
    const where: Record<string, unknown> = {};
    if (query.venueId) where.venueId = query.venueId;

    return this.prisma.screen.findMany({
      where,
      include: { venue: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const screen = await this.prisma.screen.findUnique({
      where: { id },
      include: { venue: true, _count: { select: { seats: true } } },
    });
    if (!screen) throw new NotFoundException(`Screen ${id} not found`);
    return screen;
  }

  async update(id: string, dto: UpdateScreenDto) {
    await this.findOne(id);
    if (dto.venueId) await this.assertVenueExists(dto.venueId);

    return this.prisma.screen.update({
      where: { id },
      data: dto,
      include: { venue: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    try {
      return await this.prisma.screen.delete({ where: { id } });
    } catch (e) {
      if (isForeignKeyError(e)) {
        throw new ConflictException(
          `Screen ${id} has seats or shows attached; remove them first`,
        );
      }
      throw e;
    }
  }

  private async assertVenueExists(venueId: string): Promise<void> {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
    });
    if (!venue) throw new NotFoundException(`Venue ${venueId} not found`);
  }
}
