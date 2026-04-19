import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { CountryService } from '../country/country.service';

@Injectable()
export class ShippingAddressService {
  constructor(
    private prisma: PrismaService,
    private readonly countryService: CountryService,
  ) {}

  async create(userId: string, dto: CreateAddressDto) {
    const country = await this.resolveCountryCode(dto.country);

    if (dto.isDefault) {
      await this.prisma.shippingAddress.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const existingCount = await this.prisma.shippingAddress.count({
      where: { userId },
    });

    return this.prisma.shippingAddress.create({
      data: {
        ...dto,
        country,
        userId,
        isDefault: dto.isDefault ?? existingCount === 0,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.shippingAddress.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async findOne(id: string, userId: string) {
    const address = await this.prisma.shippingAddress.findUnique({
      where: { id },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    if (address.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return address;
  }

  async update(id: string, userId: string, dto: UpdateAddressDto) {
    await this.findOne(id, userId);
    const country =
      dto.country === undefined
        ? undefined
        : await this.resolveCountryCode(dto.country);

    if (dto.isDefault) {
      await this.prisma.shippingAddress.updateMany({
        where: { userId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    return this.prisma.shippingAddress.update({
      where: { id },
      data: {
        ...dto,
        ...(country === undefined ? {} : { country }),
      },
    });
  }

  async remove(id: string, userId: string) {
    const address = await this.findOne(id, userId);

    if (address.isDefault) {
      const otherAddress = await this.prisma.shippingAddress.findFirst({
        where: { userId, id: { not: id } },
        orderBy: { createdAt: 'desc' },
      });

      if (otherAddress) {
        await this.prisma.shippingAddress.update({
          where: { id: otherAddress.id },
          data: { isDefault: true },
        });
      }
    }

    await this.prisma.shippingAddress.delete({
      where: { id },
    });

    return this.findAll(userId);
  }

  async setDefault(id: string, userId: string) {
    await this.findOne(id, userId);

    await this.prisma.shippingAddress.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });

    return this.prisma.shippingAddress.update({
      where: { id },
      data: { isDefault: true },
    });
  }

  async getDefault(userId: string) {
    const address = await this.prisma.shippingAddress.findFirst({
      where: { userId, isDefault: true },
    });

    if (!address) {
      throw new NotFoundException('Default address not found');
    }

    return address;
  }

  private async resolveCountryCode(country?: string): Promise<string | undefined> {
    const normalizedInput = country?.trim();

    if (!normalizedInput) {
      return undefined;
    }

    const directCode = normalizedInput.toUpperCase();

    try {
      const countryEntity = await this.countryService.findByCode(directCode);
      return countryEntity.code.toUpperCase();
    } catch {}

    const countryEntity = await this.prisma.country.findFirst({
      where: {
        OR: [
          {
            name: {
              equals: normalizedInput,
              mode: 'insensitive',
            },
          },
          {
            translations: {
              some: {
                name: {
                  equals: normalizedInput,
                  mode: 'insensitive',
                },
              },
            },
          },
        ],
      },
      select: {
        code: true,
      },
    });

    if (!countryEntity) {
      throw new BadRequestException('Country must be a valid ISO code or known country name');
    }

    return countryEntity.code.toUpperCase();
  }
}
