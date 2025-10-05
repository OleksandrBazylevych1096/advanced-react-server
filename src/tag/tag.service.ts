import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { TagQueryDto } from './dto/tag-query.dto';
import { AssignTagsDto, CreateTagsDto } from './dto/assign-tags.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class TagService {
  constructor(private prisma: PrismaService) {}

  private getIncludeWithTranslations(locale?: string) {
    return {
      translations: locale ? { where: { locale } } : true,
      _count: {
        select: {
          products: true,
        },
      },
    };
  }

  private transformTagWithTranslation(tag: any, locale: string = 'en') {
    // Шукаємо переклад для поточної локалі
    const translation = tag.translations?.find((t: any) => t.locale === locale);

    // Якщо переклад знайдено, використовуємо його
    if (translation) {
      return {
        ...tag,
        name: translation.name || tag.name,
        description: translation.description || tag.description,
        translations: undefined, // Видаляємо масив перекладів з результату
      };
    }

    // Якщо переклад не знайдено, використовуємо базові значення
    const { translations, ...tagWithoutTranslations } = tag;
    return tagWithoutTranslations;
  }

  async create(createTagDto: CreateTagDto) {
    // Check if name already exists
    const existingName = await this.prisma.tag.findUnique({
      where: { name: createTagDto.name },
    });

    if (existingName) {
      throw new BadRequestException('Tag with this name already exists');
    }

    // Check if slug already exists
    const existingSlug = await this.prisma.tag.findUnique({
      where: { slug: createTagDto.slug },
    });

    if (existingSlug) {
      throw new BadRequestException('Tag with this slug already exists');
    }

    const { translations, ...tagData } = createTagDto;

    return this.prisma.tag.create({
      data: {
        ...tagData,
        translations: {
          create: translations,
        },
      },
      include: {
        translations: true,
        _count: {
          select: {
            products: true,
          },
        },
      },
    });
  }

  async findAll(query: TagQueryDto, locale: string = 'en') {
    const {
      search,
      isActive,
      sortBy = 'name',
      sortOrder = 'asc',
      page = 1,
      limit = 10,
    } = query;

    const where: Prisma.TagWhereInput = {
      AND: [
        search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                {
                  translations: {
                    some: {
                      OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        {
                          description: {
                            contains: search,
                            mode: 'insensitive',
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            }
          : {},
        isActive !== undefined ? { isActive } : {},
      ],
    };

    let orderBy: Prisma.TagOrderByWithRelationInput;

    if (sortBy === 'productCount') {
      orderBy = {
        products: {
          _count: sortOrder,
        },
      };
    } else {
      orderBy = {
        [sortBy]: sortOrder,
      };
    }

    const skip = (page - 1) * limit;

    const [tags, total] = await Promise.all([
      this.prisma.tag.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: this.getIncludeWithTranslations(locale),
      }),
      this.prisma.tag.count({ where }),
    ]);

    return {
      tags: tags.map((tag) => this.transformTagWithTranslation(tag, locale)),
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, locale: string = 'en') {
    const tag = await this.prisma.tag.findUnique({
      where: { id },
      include: {
        ...this.getIncludeWithTranslations(locale),
        products: {
          include: {
            images: true,
            categories: true,
            _count: {
              select: {
                reviews: true,
                favoriteProducts: true,
              },
            },
          },
          take: 12,
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    return this.transformTagWithTranslation(tag, locale);
  }

  async findBySlug(slug: string, locale: string = 'en') {
    const tag = await this.prisma.tag.findUnique({
      where: { slug },
      include: {
        ...this.getIncludeWithTranslations(locale),
        products: {
          include: {
            images: true,
            categories: true,
            _count: {
              select: {
                reviews: true,
                favoriteProducts: true,
              },
            },
          },
          take: 12,
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    return {
      ...this.transformTagWithTranslation(tag, locale),
      productCount: tag._count?.products || 0,
      products: tag.products,
    };
  }

  async update(id: string, updateTagDto: UpdateTagDto) {
    const existingTag = await this.prisma.tag.findUnique({
      where: { id },
    });

    if (!existingTag) {
      throw new NotFoundException('Tag not found');
    }

    // Check for unique constraints if updating
    if (updateTagDto.name && updateTagDto.name !== existingTag.name) {
      const existingName = await this.prisma.tag.findUnique({
        where: { name: updateTagDto.name },
      });

      if (existingName) {
        throw new BadRequestException('Tag with this name already exists');
      }
    }

    if (updateTagDto.slug && updateTagDto.slug !== existingTag.slug) {
      const existingSlug = await this.prisma.tag.findUnique({
        where: { slug: updateTagDto.slug },
      });

      if (existingSlug) {
        throw new BadRequestException('Tag with this slug already exists');
      }
    }

    const { translations, ...tagData } = updateTagDto;

    const data: any = { ...tagData };
    if (translations) {
      // Delete existing translations
      await this.prisma.tagTranslation.deleteMany({
        where: { tagId: id },
      });

      // Add new translations
      data.translations = {
        create: translations,
      };
    }

    return this.prisma.tag.update({
      where: { id },
      data,
      include: {
        translations: true,
        _count: {
          select: {
            products: true,
          },
        },
      },
    });
  }

  async remove(id: string) {
    const tag = await this.prisma.tag.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    return this.prisma.tag.delete({
      where: { id },
    });
  }

  async removeTagFromProduct(productId: string, tagId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        tags: {
          some: {
            id: tagId,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product does not have this tag');
    }

    await this.prisma.product.update({
      where: { id: productId },
      data: {
        tags: {
          disconnect: { id: tagId },
        },
      },
    });

    return this.getProductTags(productId);
  }

  async getProductTags(productId: string) {
    const productWithTags = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        tags: true,
      },
    });

    if (!productWithTags) {
      throw new NotFoundException('Product not found');
    }

    return productWithTags.tags;
  }

  async createMultipleTags(createTagsDto: CreateTagsDto) {
    const { tagNames } = createTagsDto;
    const createdTags: any[] = [];

    for (const tagName of tagNames) {
      // Generate slug from name
      const slug = tagName
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');

      // Check if tag already exists
      const existingTag = await this.prisma.tag.findFirst({
        where: {
          OR: [{ name: tagName }, { slug }],
        },
      });

      if (!existingTag) {
        const newTag = await this.prisma.tag.create({
          data: {
            name: tagName,
            slug,
            isActive: true,
          },
          include: {
            _count: {
              select: {
                products: true,
              },
            },
          },
        });
        createdTags.push(newTag);
      } else {
        createdTags.push(existingTag);
      }
    }

    return createdTags;
  }

  async getPopularTags(limit: number = 10, locale: string = 'en') {
    const tags = await this.prisma.tag.findMany({
      where: { isActive: true },
      include: this.getIncludeWithTranslations(locale),
      orderBy: {
        products: {
          _count: 'desc',
        },
      },
      take: limit,
    });

    return tags.map((tag) => {
      const transformedTag = this.transformTagWithTranslation(tag, locale);
      return {
        ...transformedTag,
        productCount: tag._count?.products || 0,
      };
    });
  }

  async searchTags(search: string, locale: string = 'en') {
    const tags = await this.prisma.tag.findMany({
      where: {
        AND: [
          { isActive: true },
          {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              {
                translations: {
                  some: {
                    OR: [
                      { name: { contains: search, mode: 'insensitive' } },
                      {
                        description: { contains: search, mode: 'insensitive' },
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
      include: this.getIncludeWithTranslations(locale),
      take: 20,
      orderBy: {
        products: {
          _count: 'desc',
        },
      },
    });

    return tags.map((tag) => this.transformTagWithTranslation(tag, locale));
  }
}
