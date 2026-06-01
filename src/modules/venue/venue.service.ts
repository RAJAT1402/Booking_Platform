import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { FindVenuesQueryDto } from './dto/find-venues-query.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';

const OWNER_ROLES = ['THEATRE_OWNER', 'ADMIN'] as const;

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
export class VenueService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateVenueDto) {
    await this.assertCityExists(dto.cityId);
    await this.assertOwnerEligible(dto.ownerId);

    const slug = dto.slug ?? this.slugify(dto.name);

    try {
      return await this.prisma.venue.create({
        data: {
          name: dto.name,
          slug,
          address: dto.address,
          lat: dto.lat,
          lng: dto.lng,
          cityId: dto.cityId,
          ownerId: dto.ownerId,
        },
        include: { city: true },
      });
    } catch (e) {
      if (isUniqueConstraintError(e)) {
        throw new ConflictException(`Venue with slug "${slug}" already exists`);
      }
      throw e;
    }
  }

  findAll(query: FindVenuesQueryDto) {
    const where: Record<string, unknown> = {};
    if (query.cityId) where.cityId = query.cityId;
    if (query.ownerId) where.ownerId = query.ownerId;
    if (query.q) where.name = { contains: query.q, mode: 'insensitive' };

    return this.prisma.venue.findMany({
      where,
      include: { city: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id },
      include: { city: true },
    });
    if (!venue) throw new NotFoundException(`Venue ${id} not found`);
    return venue;
  }

  async findBySlug(slug: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { slug },
      include: { city: true },
    });
    if (!venue) throw new NotFoundException(`Venue "${slug}" not found`);
    return venue;
  }

  async update(id: string, dto: UpdateVenueDto) {
    await this.findOne(id);
    if (dto.cityId) await this.assertCityExists(dto.cityId);
    if (dto.ownerId) await this.assertOwnerEligible(dto.ownerId);

    try {
      return await this.prisma.venue.update({
        where: { id },
        data: dto,
        include: { city: true },
      });
    } catch (e) {
      if (isUniqueConstraintError(e)) {
        throw new ConflictException(`Venue with slug "${dto.slug}" already exists`);
      }
      throw e;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    try {
      return await this.prisma.venue.delete({ where: { id } });
    } catch (e) {
      if (isForeignKeyError(e)) {
        throw new ConflictException(
          `Venue ${id} has screens attached; remove screens first`,
        );
      }
      throw e;
    }
  }

  private async assertCityExists(cityId: string): Promise<void> {
    const city = await this.prisma.city.findUnique({ where: { id: cityId } });
    if (!city) throw new NotFoundException(`City ${cityId} not found`);
  }

  private async assertOwnerEligible(ownerId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, role: true },
    });
    if (!user) throw new NotFoundException(`User ${ownerId} not found`);
    if (!OWNER_ROLES.includes(user.role as (typeof OWNER_ROLES)[number])) {
      throw new ForbiddenException(
        `User ${ownerId} must have role THEATRE_OWNER or ADMIN to own a venue`,
      );
    }
  }

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
