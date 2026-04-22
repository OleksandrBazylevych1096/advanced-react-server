import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewQueryDto } from './dto/review-query.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReviewService {
  constructor(private prisma: PrismaService) {}

  private buildSlugMap(
    fallbackSlug?: string,
    translations?: Array<{ locale: string; slug: string }>,
  ) {
    const enSlug = translations?.find((t) => t.locale === 'en')?.slug;
    const deSlug = translations?.find((t) => t.locale === 'de')?.slug;

    return {
      en: enSlug ?? fallbackSlug ?? '',
      de: deSlug ?? fallbackSlug ?? '',
    };
  }

  private addProductSlugMap<T extends { product?: any }>(review: T): T {
    if (!review?.product) {
      return review;
    }

    const product = review.product;
    return {
      ...review,
      product: {
        ...product,
        slugMap: this.buildSlugMap(product.slug, product.translations),
        translations: undefined,
      },
    };
  }

  async create(userId: string, createReviewDto: CreateReviewDto) {
    const { productId, rating, title, comment } = createReviewDto;
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const existingReview = await this.prisma.review.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    if (existingReview) {
      throw new BadRequestException('You have already reviewed this product');
    }
    const userOrder = await this.prisma.orderItem.findFirst({
      where: {
        productId,
        order: {
          userId,
          status: 'DELIVERED', // Only allow reviews for delivered orders
        },
      },
    });

    const isVerified = !!userOrder;

    const review = await this.prisma.review.create({
      data: {
        userId,
        productId,
        rating,
        title,
        comment,
        isVerified,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            translations: {
              where: { locale: { in: ['en', 'de'] } },
              select: { locale: true, slug: true },
            },
          },
        },
      },
    });

    return this.addProductSlugMap(review);
  }

  async findAll(query: ReviewQueryDto) {
    const {
      productId,
      rating,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 10,
    } = query;

    const where: Prisma.ReviewWhereInput = {
      AND: [productId ? { productId } : {}, rating ? { rating } : {}],
    };

    const orderBy: Prisma.ReviewOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              translations: {
                where: { locale: { in: ['en', 'de'] } },
                select: { locale: true, slug: true },
              },
              images: {
                take: 1,
                where: { isMain: true },
              },
            },
          },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      reviews: reviews.map((review) => this.addProductSlugMap(review)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async findOne(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            translations: {
              where: { locale: { in: ['en', 'de'] } },
              select: { locale: true, slug: true },
            },
            images: {
              take: 1,
              where: { isMain: true },
            },
          },
        },
      },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return this.addProductSlugMap(review);
  }

  async findByProduct(productId: string, query: ReviewQueryDto) {
    const modifiedQuery = { ...query, productId };
    return this.findAll(modifiedQuery);
  }

  async findByUser(userId: string, query: ReviewQueryDto) {
    const {
      rating,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 10,
    } = query;

    const where: Prisma.ReviewWhereInput = {
      AND: [{ userId }, rating ? { rating } : {}],
    };

    const orderBy: Prisma.ReviewOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              translations: {
                where: { locale: { in: ['en', 'de'] } },
                select: { locale: true, slug: true },
              },
              images: {
                take: 1,
                where: { isMain: true },
              },
            },
          },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      reviews: reviews.map((review) => this.addProductSlugMap(review)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async update(id: string, userId: string, updateReviewDto: UpdateReviewDto) {
    const review = await this.prisma.review.findUnique({
      where: { id },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }
    if (review.userId !== userId) {
      throw new ForbiddenException('You can only update your own reviews');
    }

    const { productId, ...updateData } = updateReviewDto;

    const updatedReview = await this.prisma.review.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            translations: {
              where: { locale: { in: ['en', 'de'] } },
              select: { locale: true, slug: true },
            },
          },
        },
      },
    });

    return this.addProductSlugMap(updatedReview);
  }

  async remove(id: string, userId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }
    if (review.userId !== userId) {
      throw new ForbiddenException('You can only delete your own reviews');
    }

    return this.prisma.review.delete({
      where: { id },
    });
  }

  async getProductReviewStats(productId: string) {
    const [reviews, ratingStats] = await Promise.all([
      this.prisma.review.findMany({
        where: { productId },
        select: { rating: true },
      }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { productId },
        _count: {
          rating: true,
        },
      }),
    ]);

    const totalReviews = reviews.length;
    const averageRating =
      totalReviews > 0
        ? reviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews
        : 0;

    const ratingDistribution = {
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0,
    };

    ratingStats.forEach((stat) => {
      ratingDistribution[stat.rating] = stat._count.rating;
    });

    return {
      totalReviews,
      averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
      ratingDistribution,
    };
  }

  async canUserReview(userId: string, productId: string): Promise<boolean> {
    const existingReview = await this.prisma.review.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    if (existingReview) {
      return false;
    }
    const userOrder = await this.prisma.orderItem.findFirst({
      where: {
        productId,
        order: {
          userId,
          status: 'DELIVERED',
        },
      },
    });

    return !!userOrder;
  }

  async getRecentReviews(limit: number = 10) {
    const reviews = await this.prisma.review.findMany({
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            translations: {
              where: { locale: { in: ['en', 'de'] } },
              select: { locale: true, slug: true },
            },
            images: {
              take: 1,
              where: { isMain: true },
            },
          },
        },
      },
    });

    return reviews.map((review) => this.addProductSlugMap(review));
  }
}
