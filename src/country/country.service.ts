import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';

@Injectable()
export class CountryService {
  constructor(private prisma: PrismaService) {}

  async create(createCountryDto: CreateCountryDto) {
    const { translations, ...countryData } = createCountryDto;
    const existingCountry = await this.prisma.country.findUnique({
      where: { code: countryData.code },
    });

    if (existingCountry) {
      throw new BadRequestException(
        `Country with code "${countryData.code}" already exists`,
      );
    }

    return this.prisma.country.create({
      data: {
        ...countryData,
        translations: translations
          ? {
              create: translations,
            }
          : undefined,
      },
      include: {
        translations: true,
      },
    });
  }

  async findAll(locale?: string) {
    const countries = await this.prisma.country.findMany({
      where: { isActive: true },
      include: {
        translations: locale
          ? {
              where: { locale },
            }
          : true,
      },
      orderBy: { name: 'asc' },
    });
    return countries.map((country) => {
      const translation = country.translations?.find((t) => t.locale === locale);
      return {
        id: country.id,
        code: country.code,
        name: translation?.name || country.name,
        isActive: country.isActive,
      };
    });
  }

  async findOne(id: string, locale?: string) {
    const country = await this.prisma.country.findUnique({
      where: { id },
      include: {
        translations: locale
          ? {
              where: { locale },
            }
          : true,
      },
    });

    if (!country) {
      throw new NotFoundException('Country not found');
    }

    return country;
  }

  async findByCode(code: string, locale?: string) {
    const country = await this.prisma.country.findUnique({
      where: { code },
      include: {
        translations: locale
          ? {
              where: { locale },
            }
          : true,
      },
    });

    if (!country) {
      throw new NotFoundException('Country not found');
    }

    return country;
  }

  async update(id: string, updateCountryDto: UpdateCountryDto) {
    const existingCountry = await this.prisma.country.findUnique({
      where: { id },
    });

    if (!existingCountry) {
      throw new NotFoundException('Country not found');
    }

    const { translations, ...countryData } = updateCountryDto;
    if (updateCountryDto.code && updateCountryDto.code !== existingCountry.code) {
      const codeExists = await this.prisma.country.findUnique({
        where: { code: updateCountryDto.code },
      });

      if (codeExists) {
        throw new BadRequestException(
          `Country with code "${updateCountryDto.code}" already exists`,
        );
      }
    }

    return this.prisma.country.update({
      where: { id },
      data: {
        ...countryData,
        translations: translations
          ? {
              deleteMany: {},
              create: translations,
            }
          : undefined,
      },
      include: {
        translations: true,
      },
    });
  }

  async remove(id: string) {
    const country = await this.prisma.country.findUnique({
      where: { id },
    });

    if (!country) {
      throw new NotFoundException('Country not found');
    }

    return this.prisma.country.delete({
      where: { id },
    });
  }
  async getCountriesForFacets(
    countryCodes: string[],
    locale: string,
  ): Promise<Map<string, { code: string; name: string }>> {
    const countries = await this.prisma.country.findMany({
      where: {
        code: { in: countryCodes },
        isActive: true,
      },
      include: {
        translations: {
          where: { locale },
        },
      },
    });
    const countryMap: Map<string, { code: string; name: string }> = new Map(
      countries.map((country) => {
        const translation = country.translations?.[0];
        return [
          country.code,
          {
            code: country.code,
            name: translation?.name || country.name,
          },
        ];
      }),
    );

    return countryMap;
  }
}
