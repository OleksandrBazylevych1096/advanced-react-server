import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePromoBannerDto } from './dto/create-promo-banner.dto';
import { UpdatePromoBannerDto } from './dto/update-promo-banner.dto';

@Injectable()
export class PromoBannerService {
  constructor(private prisma: PrismaService) {}

  create(createPromoBannerDto: CreatePromoBannerDto) {
    return this.prisma.promoBanner.create({
      data: {
        ...createPromoBannerDto,
        isActive: createPromoBannerDto.isActive ?? true,
      },
    });
  }

  findAll() {
    return this.prisma.promoBanner.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findActive() {
    const banners = await this.prisma.promoBanner.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return banners.map((banner) => banner.imageUrl);
  }

  async findOne(id: string) {
    const banner = await this.prisma.promoBanner.findUnique({
      where: { id },
    });

    if (!banner) {
      throw new NotFoundException('Promo banner not found');
    }

    return banner;
  }

  async update(id: string, updatePromoBannerDto: UpdatePromoBannerDto) {
    const banner = await this.prisma.promoBanner.findUnique({
      where: { id },
    });

    if (!banner) {
      throw new NotFoundException('Promo banner not found');
    }

    return this.prisma.promoBanner.update({
      where: { id },
      data: updatePromoBannerDto,
    });
  }

  async remove(id: string) {
    const banner = await this.prisma.promoBanner.findUnique({
      where: { id },
    });

    if (!banner) {
      throw new NotFoundException('Promo banner not found');
    }

    return this.prisma.promoBanner.delete({
      where: { id },
    });
  }
}
