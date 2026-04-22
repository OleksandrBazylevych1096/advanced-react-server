import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { CreateProductI18nDto } from './dto/create-product-i18n.dto';
import { UpdateProductI18nDto } from './dto/update-product-i18n.dto';
import { ProductQueryI18nDto } from './dto/product-query-i18n.dto';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { buildSlugMap, normalizeLocale } from '../common/i18n.util';

@Injectable()
export class ProductService {
  constructor(
    private prisma: PrismaService,
    private exchangeRateService: ExchangeRateService,
  ) {}

  private normalizeLocale(locale?: string): string {
    return normalizeLocale(locale);
  }

  private buildSlugMap(
    fallbackSlug?: string,
    translations?: Array<{ locale: string; slug: string }>,
  ) {
    return buildSlugMap(fallbackSlug, translations);
  }

  private getIncludeWithTranslations(locale?: string) {
    locale = normalizeLocale(locale);
    return {
      categories: {
        include: {
          translations: true,
        },
      },
      tags: {
        include: {
          translations: locale
            ? {
                where: { locale },
              }
            : true,
        },
      },
      images: true,
      translations: true,
      reviews: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
        },
      },
      _count: {
        select: {
          reviews: true,
          favoriteProducts: true,
          orderItems: true,
        },
      },
    };
  }
  private async transformProductWithTranslation(
    product: any,
    locale: string = 'en',
    currency: string = 'USD',
  ) {
    const normalizedLocale = normalizeLocale(locale);
    const translation = product.translations?.find(
      (t: any) => t.locale === normalizedLocale,
    );

    if (translation) {
      const fallbackSlug = product.slug;
      product.name = translation.name;
      product.slug = translation.slug;
      product.shortDescription = translation.shortDescription;
      product.description = translation.description;
      product.slugMap = buildSlugMap(fallbackSlug, product.translations);
    } else {
      product.slugMap = buildSlugMap(product.slug, product.translations);
    }
    if (product.price) {
      const priceNumber = product.price;

      product.price =
        currency !== 'USD'
          ? await this.exchangeRateService.convertPrice(
              priceNumber,
              'USD',
              currency,
            )
          : priceNumber;
    }

    if (product.oldPrice) {
      const oldPriceNumber =
        typeof product.oldPrice.toNumber === 'function'
          ? product.oldPrice.toNumber()
          : product.oldPrice;

      product.oldPrice =
        currency !== 'USD'
          ? await this.exchangeRateService.convertPrice(
              oldPriceNumber,
              'USD',
              currency,
            )
          : oldPriceNumber;
    }
    if (product.categories) {
      product.categories = product.categories.map((category: any) => {
        const catTranslation = category.translations?.find(
          (t: any) => t.locale === normalizedLocale,
        );

        if (catTranslation) {
          return {
            ...category,
            name: catTranslation.name,
            description: catTranslation.description,
            slug: catTranslation.slug,
            slugMap: this.buildSlugMap(category.slug, category.translations),
            translations: undefined, // РџСЂРёР±РёСЂР°С”РјРѕ translations Р· РІС–РґРїРѕРІС–РґС–
          };
        }
        return {
          ...category,
          slugMap: this.buildSlugMap(category.slug, category.translations),
          translations: undefined,
        };
      });
    }
    if (product.tags) {
      product.tags = product.tags.map((tag: any) => {
        const tagTranslation = tag.translations?.find(
          (t: any) => t.locale === normalizedLocale,
        );

        if (tagTranslation) {
          return {
            ...tag,
            name: tagTranslation.name,
            description: tagTranslation.description,
            translations: undefined,
          };
        }
        return { ...tag, translations: undefined };
      });
    }
    delete product.translations;
    return product;
  }

  async create(createProductDto: CreateProductI18nDto) {
    const { images, tagIds, translations, ...productData } = createProductDto;
    if (translations && translations.length > 0) {
      for (const translation of translations) {
        const existingTranslation =
          await this.prisma.productTranslation.findUnique({
            where: {
              locale_slug: {
                locale: translation.locale,
                slug: translation.slug,
              },
            },
          });

        if (existingTranslation) {
          throw new BadRequestException(
            `Product with slug "${translation.slug}" already exists for locale "${translation.locale}"`,
          );
        }
      }
    }
    const existingSlug = await this.prisma.product.findUnique({
      where: { slug: productData.slug },
    });

    if (existingSlug) {
      throw new BadRequestException('Product with this slug already exists');
    }

    return this.prisma.product.create({
      data: {
        ...productData,
        images: images
          ? {
              create: images,
            }
          : undefined,
        categories: {
          connect: (createProductDto.categoryIds || []).map((id) => ({ id })),
        },
        tags: tagIds
          ? {
              connect: tagIds.map((id) => ({ id })),
            }
          : undefined,
        translations: translations
          ? {
              create: translations,
            }
          : undefined,
      },
      include: this.getIncludeWithTranslations(),
    });
  }

  async findAll(query: ProductQueryI18nDto) {
    const {
      q,
      categoryId,
      categorySlug,
      tagId,
      minPrice,
      maxPrice,
      brands,
      countries,
      inStock,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 10,
      locale = 'uk',
      currency = 'USD',
    } = query;

    const normalizedLocale = this.normalizeLocale(locale);
    let categoryIds: string[] = [];

    if (categoryId) {
      categoryIds = await this.getCategoryWithDescendantsIds(categoryId);
    }

    if (categorySlug) {
      categoryIds = await this.getCategoryIdsBySlug(categorySlug, normalizedLocale);
    }
    const baseAnd: Prisma.ProductWhereInput[] = [
      { isActive: true },

      inStock === true ? { stock: { gt: 0 } } : {},

      brands?.length ? { brand: { in: brands } } : {},

      countries?.length ? { country: { in: countries } } : {},

      minPrice !== undefined ? { price: { gte: minPrice } } : {},
      maxPrice !== undefined ? { price: { lte: maxPrice } } : {},

      categoryIds.length
        ? {
            categories: {
              some: { id: { in: categoryIds } },
            },
          }
        : {},

      tagId
        ? {
            tags: {
              some: { id: tagId },
            },
          }
        : {},

      q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { slug: { contains: q, mode: 'insensitive' } },
              {
                translations: {
                  some: {
                    locale: normalizedLocale,
                    OR: [
                      { name: { contains: q, mode: 'insensitive' } },
                      { slug: { contains: q, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            ],
          }
        : {},
    ];

    const where: Prisma.ProductWhereInput = {
      AND: baseAnd,
    };
    let orderBy:
      | Prisma.ProductOrderByWithRelationInput
      | Prisma.ProductOrderByWithRelationInput[];

    if (sortBy === 'sales') {
      orderBy = [{ orderItems: { _count: sortOrder } }, { createdAt: 'desc' }];
    } else if (sortBy === 'rating') {
      orderBy = [{ reviews: { _count: sortOrder } }, { createdAt: 'desc' }];
    } else {
      orderBy = { [sortBy]: sortOrder };
    }
    const skip = (page - 1) * limit;

    const whereWithoutPrice: Prisma.ProductWhereInput = {
      AND: baseAnd.filter((f: any) => !f.price),
    };

    const whereWithoutBrand: Prisma.ProductWhereInput = {
      AND: baseAnd.filter((f: any) => !f.brand),
    };

    const whereWithoutCountry: Prisma.ProductWhereInput = {
      AND: baseAnd.filter((f: any) => !f.country),
    };

    const whereWithoutStock: Prisma.ProductWhereInput = {
      AND: baseAnd.filter((f: any) => !f.stock),
    };
    const [
      products,
      total,
      priceFacet,
      brandFacetRaw,
      countryFacetRaw,
      stockFacetRaw,
    ] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: this.getIncludeWithTranslations(normalizedLocale),
      }),

      this.prisma.product.count({ where }),
      this.prisma.product.aggregate({
        where: whereWithoutPrice,
        _min: { price: true },
        _max: { price: true },
      }),
      this.prisma.product.groupBy({
        by: ['brand'],
        where: {
          ...whereWithoutBrand,
          brand: { not: null },
        },
        _count: { _all: true },
      }),
      this.prisma.product.groupBy({
        by: ['country'],
        where: {
          ...whereWithoutCountry,
          country: { not: null },
        },
        _count: { _all: true },
      }),
      this.prisma.product.groupBy({
        by: ['stock'],
        where: whereWithoutStock,
        _count: { _all: true },
      }),
    ]);

    const countryCodes = countryFacetRaw
      .map((countryGroup) => countryGroup.country)
      .filter((code): code is string => Boolean(code));

    const countryEntities = countryCodes.length
      ? await this.prisma.country.findMany({
          where: {
            code: {
              in: countryCodes,
            },
          },
          include: {
            translations: {
              where: { locale: normalizedLocale },
              take: 1,
            },
          },
        })
      : [];

    const countryLabelByCode = new Map(
      countryEntities.map((country) => [
        country.code,
        country.translations?.[0]?.name || country.name || country.code,
      ]),
    );
    const transformedProducts = await Promise.all(
      products.map((p) =>
        this.transformProductWithTranslation(p, normalizedLocale, currency),
      ),
    );
    const inStockCount = stockFacetRaw.reduce(
      (acc, s) => {
        if (s.stock > 0) acc.true += s._count._all;
        else acc.false += s._count._all;
        return acc;
      },
      { true: 0, false: 0 },
    );
    let minPriceFacet = priceFacet._min.price;
    let maxPriceFacet = priceFacet._max.price;

    if (
      currency !== 'USD' &&
      minPriceFacet !== null &&
      maxPriceFacet !== null
    ) {
      [minPriceFacet, maxPriceFacet] = await Promise.all([
        this.exchangeRateService
          .convertPrice(minPriceFacet.toNumber(), 'USD', currency)
          .then((n) => new Decimal(n)),
        this.exchangeRateService
          .convertPrice(maxPriceFacet.toNumber(), 'USD', currency)
          .then((n) => new Decimal(n)),
      ]);
    }
    const totalPages = Math.ceil(total / limit);

    return {
      products: transformedProducts,
      pagination: {
        hasNext: page < totalPages,
        hasPrev: page > 1,
        limit,
        page,
        total,
        totalPages,
      },
      facets: {
        priceRange: {
          min: minPriceFacet?.toNumber(),
          max: maxPriceFacet?.toNumber(),
        },
        brands: brandFacetRaw.map((b) => ({
          value: b.brand,
          count: b._count._all,
        })),
        countries: countryFacetRaw.map((c) => ({
          value: c.country,
          label: countryLabelByCode.get(c.country ?? '') ?? c.country,
          count: c._count._all,
        })),
        inStock: inStockCount,
      },
    };
  }

  private async getCategoryWithDescendantsIds(
    categoryId: string,
  ): Promise<string[]> {
    const ids: string[] = [categoryId];

    const children = await this.prisma.category.findMany({
      where: { parentId: categoryId },
      select: { id: true },
    });

    for (const child of children) {
      const childIds = await this.getCategoryWithDescendantsIds(child.id);
      ids.push(...childIds);
    }

    return ids;
  }

  private async getCategoryIdsBySlug(
    slug: string,
    locale: string,
  ): Promise<string[]> {
    const category = await this.prisma.category.findFirst({
      where: {
        OR: [
          { slug },
          {
            translations: {
              some: {
                slug,
                locale,
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    if (!category) return [];

    return this.getCategoryWithDescendantsIds(category.id);
  }

  async findOne(id: string, locale: string = 'uk', currency: string = 'USD') {
    locale = this.normalizeLocale(locale);
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: this.getIncludeWithTranslations(locale),
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const transformedProduct = await this.transformProductWithTranslation(
      product,
      locale,
      currency,
    );

    const averageRating =
      product.reviews?.length > 0
        ? product.reviews.reduce((sum, review) => sum + review.rating, 0) /
          product.reviews.length
        : 0;

    return {
      ...transformedProduct,
      averageRating,
      reviewCount: product._count?.reviews || 0,
      favoriteCount: product._count?.favoriteProducts || 0,
      salesCount: product._count?.orderItems || 0,
    };
  }

  async findBySlug(
    slug: string,
    locale: string = 'uk',
    currency: string = 'USD',
  ) {
    locale = this.normalizeLocale(locale);
    let product = await this.prisma.product.findFirst({
      where: {
        translations: {
          some: {
            slug,
            locale,
          },
        },
      },
      include: this.getIncludeWithTranslations(locale),
    });
    if (!product) {
      product = await this.prisma.product.findUnique({
        where: { slug },
        include: this.getIncludeWithTranslations(locale),
      });
    }

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const transformedProduct = await this.transformProductWithTranslation(
      product,
      locale,
      currency,
    );

    const averageRating =
      product.reviews?.length > 0
        ? product.reviews.reduce((sum, review) => sum + review.rating, 0) /
          product.reviews.length
        : 0;

    return {
      ...transformedProduct,
      averageRating,
      reviewCount: product._count?.reviews || 0,
      favoriteCount: product._count?.favoriteProducts || 0,
      salesCount: product._count?.orderItems || 0,
    };
  }

  async update(id: string, updateProductDto: UpdateProductI18nDto) {
    const existingProduct = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!existingProduct) {
      throw new NotFoundException('Product not found');
    }

    const { images, tagIds, categoryIds, translations, ...productData } =
      updateProductDto;
    if (translations && translations.length > 0) {
      for (const translation of translations) {
        const existingTranslation =
          await this.prisma.productTranslation.findFirst({
            where: {
              locale: translation.locale,
              slug: translation.slug,
              productId: { not: id },
            },
          });

        if (existingTranslation) {
          throw new BadRequestException(
            `Product with slug "${translation.slug}" already exists for locale "${translation.locale}"`,
          );
        }
      }
    }

    if (
      updateProductDto.slug &&
      updateProductDto.slug !== existingProduct.slug
    ) {
      const existingSlug = await this.prisma.product.findUnique({
        where: { slug: updateProductDto.slug },
      });

      if (existingSlug) {
        throw new BadRequestException('Product with this slug already exists');
      }
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        ...productData,
        images: images
          ? {
              deleteMany: {},
              create: images,
            }
          : undefined,
        categories: categoryIds
          ? {
              set: categoryIds.map((id) => ({ id })),
            }
          : undefined,
        tags: tagIds
          ? {
              set: tagIds.map((id) => ({ id })),
            }
          : undefined,
        translations: translations
          ? {
              deleteMany: {},
              create: translations,
            }
          : undefined,
      },
      include: this.getIncludeWithTranslations(),
    });
  }

  async remove(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.prisma.product.delete({
      where: { id },
    });
  }

  async getFeatured(
    limit: number = 10,
    locale: string = 'uk',
    currency: string = 'USD',
  ) {
    locale = this.normalizeLocale(locale);
    const products = await this.prisma.product.findMany({
      take: limit,
      where: {
        stock: {
          gt: 0,
        },
      },
      include: this.getIncludeWithTranslations(locale),
      orderBy: [
        {
          orderItems: {
            _count: 'desc',
          },
        },
        {
          reviews: {
            _count: 'desc',
          },
        },
      ],
    });

    return Promise.all(
      products.map((product) =>
        this.transformProductWithTranslation(product, locale, currency),
      ),
    );
  }

  async getBestSellers(
    limit: number = 10,
    locale: string = 'uk',
    currency: string = 'USD',
  ) {
    locale = this.normalizeLocale(locale);
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          stock: {
            gt: 0,
          },
        },
        include: this.getIncludeWithTranslations(locale),
        orderBy: [
          {
            orderItems: {
              _count: 'desc',
            },
          },
        ],
        take: limit,
      }),
      this.prisma.product.count({
        where: { stock: { gt: 0 } },
      }),
    ]);

    const transformedProducts = await Promise.all(
      products.map(async (product) => {
        return this.transformProductWithTranslation(product, locale, currency);
      }),
    );

    const totalPages = Math.ceil(total / limit);

    return {
      products: transformedProducts,
      pagination: {
        hasNext: 1 < totalPages,
        hasPrev: false,
        limit,
        page: 1,
        total,
        totalPages,
      },
    };
  }

  async getFirstOrderDiscount(locale: string = 'uk', currency: string = 'USD') {
    locale = this.normalizeLocale(locale);
    const products = await this.prisma.product.findMany({
      where: {
        stock: {
          gt: 0,
        },
        price: {
          gt: 0,
        },
      },
      take: 3,
      orderBy: {
        price: 'desc',
      },
      include: this.getIncludeWithTranslations(locale),
    });

    return Promise.all(
      products.map(async (product) => {
        const originalPrice =
          typeof product.price === 'number'
            ? product.price
            : product.price.toNumber();
        const discountedPrice = originalPrice * 0.9; // 10% discount
        const [convertedOriginalPrice, convertedDiscountedPrice] =
          await Promise.all([
            currency !== 'USD'
              ? this.exchangeRateService.convertPrice(
                  originalPrice,
                  'USD',
                  currency,
                )
              : originalPrice,
            currency !== 'USD'
              ? this.exchangeRateService.convertPrice(
                  discountedPrice,
                  'USD',
                  currency,
                )
              : discountedPrice,
          ]);
        const transformedProduct = await this.transformProductWithTranslation(
          {
            ...product,
            price: discountedPrice, // Set the discounted price for transformation
          },
          locale,
          currency,
        );

        return {
          ...transformedProduct,
          oldPrice: convertedOriginalPrice,
          price: convertedDiscountedPrice,
        };
      }),
    );
  }

  async getRelatedProducts(
    productId: string,
    limit: number = 4,
    locale: string = 'uk',
    currency: string = 'USD',
  ) {
    locale = this.normalizeLocale(locale);
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        categories: {
          select: { id: true },
        },
        tags: {
          select: { id: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const categoryIds = product.categories.map((c) => c.id);
    const tagIds = product.tags.map((t) => t.id);

    const products = await this.prisma.product.findMany({
      where: {
        OR: [
          {
            categories: {
              some: {
                id: { in: categoryIds },
              },
            },
          },
          {
            tags: {
              some: {
                id: { in: tagIds },
              },
            },
          },
        ],
        id: { not: productId },
        stock: {
          gt: 0,
        },
      },
      take: limit,
      include: this.getIncludeWithTranslations(locale),
      orderBy: {
        createdAt: 'desc',
      },
    });

    return Promise.all(
      products.map((product) =>
        this.transformProductWithTranslation(product, locale, currency),
      ),
    );
  }
}
