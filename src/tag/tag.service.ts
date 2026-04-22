import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildSlugMap, normalizeLocale } from '../common/i18n.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { TagQueryDto } from './dto/tag-query.dto';
import { AssignTagsDto, CreateTagsDto } from './dto/assign-tags.dto';

@Injectable()
export class TagService {
  constructor(private prisma: PrismaService) {}

  private normalizeLocale(locale?: string): string {
    return normalizeLocale(locale);
  }

  private buildSlugMap(
    fallbackSlug?: string,
    translations?: Array<{ locale: string; slug: string }>,
  ) {
    return buildSlugMap(fallbackSlug, translations);
  }

  private getIncludeWithTranslations() {
    return {
      translations: true,
      _count: {
        select: {
          products: true,
        },
      },
    };
  }

  private transformTagWithTranslation(tag: any, locale: string = 'en') {
    const normalizedLocale = this.normalizeLocale(locale);
    const translation = tag.translations?.find(
      (item: any) => item.locale === normalizedLocale,
    );

    if (translation) {
      const fallbackSlug = tag.slug;

      return {
        ...tag,
        name: translation.name || tag.name,
        description: translation.description || tag.description,
        slug: translation.slug || tag.slug,
        slugMap: this.buildSlugMap(fallbackSlug, tag.translations),
        translations: undefined,
      };
    }

    const { translations, ...tagWithoutTranslations } = tag;

    return {
      ...tagWithoutTranslations,
      slugMap: this.buildSlugMap(tag.slug, translations),
    };
  }

  private async ensureTranslationSlugsAreUnique(
    translations:
      | Array<{ locale: string; slug: string }>
      | undefined,
    currentTagId?: string,
  ) {
    if (!translations?.length) {
      return;
    }

    for (const translation of translations) {
      const existingTranslation = await this.prisma.tagTranslation.findFirst({
        where: {
          locale: this.normalizeLocale(translation.locale),
          slug: translation.slug,
          ...(currentTagId ? { NOT: { tagId: currentTagId } } : {}),
        } as any,
      } as any);

      if (existingTranslation) {
        throw new BadRequestException(
          `Tag with slug "${translation.slug}" already exists for locale "${translation.locale}"`,
        );
      }
    }
  }

  async create(createTagDto: CreateTagDto) {
    const existingName = await this.prisma.tag.findUnique({
      where: { name: createTagDto.name },
    });

    if (existingName) {
      throw new BadRequestException('Tag with this name already exists');
    }

    const existingSlug = await this.prisma.tag.findUnique({
      where: { slug: createTagDto.slug },
    });

    if (existingSlug) {
      throw new BadRequestException('Tag with this slug already exists');
    }

    await this.ensureTranslationSlugsAreUnique(createTagDto.translations);

    const { translations, ...tagData } = createTagDto;

    return this.prisma.tag.create({
      data: {
        ...tagData,
        translations: {
          create: translations.map((translation) => ({
            ...translation,
            locale: this.normalizeLocale(translation.locale),
          })),
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
    const normalizedLocale = this.normalizeLocale(locale);
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
        include: this.getIncludeWithTranslations(),
      }),
      this.prisma.tag.count({ where }),
    ]);

    return {
      tags: tags.map((tag) =>
        this.transformTagWithTranslation(tag, normalizedLocale),
      ),
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, locale: string = 'en') {
    const normalizedLocale = this.normalizeLocale(locale);
    const tag = await this.prisma.tag.findUnique({
      where: { id },
      include: {
        ...this.getIncludeWithTranslations(),
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

    return this.transformTagWithTranslation(tag, normalizedLocale);
  }

  async findBySlug(slug: string, locale: string = 'en') {
    const normalizedLocale = this.normalizeLocale(locale);
    let tag = await this.prisma.tag.findUnique({
      where: { slug },
      include: {
        ...this.getIncludeWithTranslations(),
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
      const translation = await this.prisma.tagTranslation.findFirst({
        where: {
          locale: normalizedLocale,
          slug,
        },
        include: {
          tag: {
            include: {
              ...this.getIncludeWithTranslations(),
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
          },
        },
      } as any);

      tag = (translation as any)?.tag ?? null;
    }

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    return {
      ...this.transformTagWithTranslation(tag, normalizedLocale),
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

    await this.ensureTranslationSlugsAreUnique(updateTagDto.translations, id);

    const { translations, ...tagData } = updateTagDto;

    const data: any = { ...tagData };
    if (translations) {
      await this.prisma.tagTranslation.deleteMany({
        where: { tagId: id },
      });

      data.translations = {
        create: translations.map((translation) => ({
          ...translation,
          locale: this.normalizeLocale(translation.locale),
        })),
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
      const slug = tagName
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');

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
    const normalizedLocale = this.normalizeLocale(locale);
    const tags = await this.prisma.tag.findMany({
      where: { isActive: true },
      include: this.getIncludeWithTranslations(),
      orderBy: {
        products: {
          _count: 'desc',
        },
      },
      take: limit,
    });

    return tags.map((tag) => {
      const transformedTag = this.transformTagWithTranslation(
        tag,
        normalizedLocale,
      );
      return {
        ...transformedTag,
        productCount: tag._count?.products || 0,
      };
    });
  }

  async searchTags(search: string, locale: string = 'en') {
    const normalizedLocale = this.normalizeLocale(locale);
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
      include: this.getIncludeWithTranslations(),
      take: 20,
      orderBy: {
        products: {
          _count: 'desc',
        },
      },
    });

    return tags.map((tag) =>
      this.transformTagWithTranslation(tag, normalizedLocale),
    );
  }
}
