import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCityDto } from './dto/create-city.dto';
import { UpdateCityDto } from './dto/update-city.dto';

function isUniqueConstraintError(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code: unknown }).code === 'P2002'
  );
}

@Injectable()
export class CityService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCityDto) {
    const slug = dto.slug ?? this.slugify(dto.name);
    try {
      return await this.prisma.city.create({
        data: { name: dto.name, state: dto.state, slug },
      });
    } catch (e) {
      if (isUniqueConstraintError(e)) {
        throw new ConflictException(`City with slug "${slug}" already exists`);
      }
      throw e;
    }
  }

  findAll() {
    return this.prisma.city.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const city = await this.prisma.city.findUnique({ where: { id } });
    if (!city) throw new NotFoundException(`City ${id} not found`);
    return city;
  }

  async findBySlug(slug: string) {
    const city = await this.prisma.city.findUnique({ where: { slug } });
    if (!city) throw new NotFoundException(`City "${slug}" not found`);
    return city;
  }

  async update(id: string, dto: UpdateCityDto) {
    await this.findOne(id);
    try {
      return await this.prisma.city.update({ where: { id }, data: dto });
    } catch (e) {
      if (isUniqueConstraintError(e)) {
        throw new ConflictException(`City with slug "${dto.slug}" already exists`);
      }
      throw e;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.city.delete({ where: { id } });
  }

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}