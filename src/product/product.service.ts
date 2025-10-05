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

@Injectable()
export class ProductService {
  constructor(
    private prisma: PrismaService,
    private exchangeRateService: ExchangeRateService,
  ) {}

  private getIncludeWithTranslations(locale?: string) {
    return {
      categories: {
        include: {
          translations: locale
            ? {
                where: { locale },
              }
            : true,
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
      translations: locale
        ? {
            where: { locale },
          }
        : true,
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

  // Допоміжний метод для трансформації продукту з переkладами
  private async transformProductWithTranslation(
    product: any,
    locale: string = 'en',
    currency: string = 'USD',
  ) {
    const translation =
      product.translations?.find((t: any) => t.locale === locale) ||
      product.translations?.[0]; // Fallback до першого доступного перекладу

    if (translation) {
      product.name = translation.name;
      product.slug = translation.slug;
      product.shortDescription = translation.shortDescription;
      product.description = translation.description;
    }

    // Handle price conversion
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

    // Трансформуємо категорії
    if (product.categories) {
      product.categories = product.categories.map((category: any) => {
        const catTranslation =
          category.translations?.find((t: any) => t.locale === locale) ||
          category.translations?.[0];

        if (catTranslation) {
          return {
            ...category,
            name: catTranslation.name,
            description: catTranslation.description,
            slug: catTranslation.slug,
            translations: undefined, // Прибираємо translations з відповіді
          };
        }
        return { ...category, translations: undefined };
      });
    }

    // Трансформуємо теги
    if (product.tags) {
      product.tags = product.tags.map((tag: any) => {
        const tagTranslation =
          tag.translations?.find((t: any) => t.locale === locale) ||
          tag.translations?.[0];

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

    // Прибираємо translations з основної відповіді
    delete product.translations;
    return product;
  }

  async create(createProductDto: CreateProductI18nDto) {
    const { images, tagIds, translations, ...productData } = createProductDto;

    // Перевіряємо унікальність slug для кожної мови
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

    // Перевіряємо основний slug
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
      search,
      categoryIds,
      tagId,
      minPrice,
      maxPrice,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 10,
      locale = 'uk',
    } = query;

    const where: Prisma.ProductWhereInput = {
      AND: [
        {
          stock: {
            gt: 0,
          },
        },
        search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { shortDescription: { contains: search, mode: 'insensitive' } },
                { slug: { contains: search, mode: 'insensitive' } },
                // Пошук по перекладах
                {
                  translations: {
                    some: {
                      locale,
                      OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        {
                          description: {
                            contains: search,
                            mode: 'insensitive',
                          },
                        },
                        {
                          shortDescription: {
                            contains: search,
                            mode: 'insensitive',
                          },
                        },
                        { slug: { contains: search, mode: 'insensitive' } },
                      ],
                    },
                  },
                },
              ],
            }
          : {},
        categoryIds && categoryIds.length > 0
          ? {
              categories: {
                some: {
                  id: { in: categoryIds },
                },
              },
            }
          : {},
        tagId
          ? {
              tags: {
                some: {
                  id: tagId,
                },
              },
            }
          : {},
        minPrice !== undefined ? { price: { gte: minPrice } } : {},
        maxPrice !== undefined ? { price: { lte: maxPrice } } : {},
      ],
    };

    let orderBy:
      | Prisma.ProductOrderByWithRelationInput
      | Prisma.ProductOrderByWithRelationInput[];

    if (sortBy === 'sales') {
      orderBy = [
        {
          orderItems: {
            _count: sortOrder,
          },
        },
        {
          createdAt: sortOrder,
        },
      ];
    } else if (sortBy === 'rating') {
      orderBy = [
        {
          reviews: {
            _count: sortOrder,
          },
        },
        {
          createdAt: sortOrder,
        },
      ];
    } else {
      orderBy = {
        [sortBy]: sortOrder,
      };
    }

    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: this.getIncludeWithTranslations(locale),
      }),
      this.prisma.product.count({ where }),
    ]);

    const transformedProducts = await Promise.all(
      products.map((product) =>
        this.transformProductWithTranslation(product, locale, query.currency),
      ),
    );

    return { products: transformedProducts, total };
  }

  async findOne(id: string, locale: string = 'uk', currency: string = 'USD') {
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
    // Спочатку шукаємо по переkладу
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

    // Якщо не знайдено по переkладу, шукаємо по основному slug
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

    // Перевіряємо унікальність slug для переkладів
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

    return products.map((product) =>
      this.transformProductWithTranslation(product, locale),
    );
  }

  async getBestSellers(
    limit: number = 10,
    locale: string = 'uk',
    currency: string = 'USD',
  ) {
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

    return { products: transformedProducts, total };
  }

  async getFirstOrderDiscount(locale: string = 'uk', currency: string = 'USD') {
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

        // Calculate the discounted price in USD first
        const discountedPrice = originalPrice * 0.9; // 10% discount

        // Convert both prices to target currency if needed
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

        // Get the transformed product with translations
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

    return products.map((product) =>
      this.transformProductWithTranslation(product, locale),
    );
  }
}
