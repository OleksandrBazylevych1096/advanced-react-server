import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FavoriteService {
  constructor(private prisma: PrismaService) {}

  async addToFavorites(userId: string, productId: string) {
    // Check if product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Check if already in favorites
    const existingFavorite = await this.prisma.favoriteProduct.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    if (existingFavorite) {
      throw new BadRequestException('Product is already in favorites');
    }

    return this.prisma.favoriteProduct.create({
      data: {
        userId,
        productId,
      },
      include: {
        product: {
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
        },
      },
    });
  }

  async removeFromFavorites(userId: string, productId: string) {
    const favorite = await this.prisma.favoriteProduct.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    if (!favorite) {
      throw new NotFoundException('Product not found in favorites');
    }

    return this.prisma.favoriteProduct.delete({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });
  }

  async getUserFavorites(userId: string) {
    const favorites = await this.prisma.favoriteProduct.findMany({
      where: { userId },
      include: {
        product: {
          include: {
            images: true,
            categories: true,
            reviews: {
              select: {
                rating: true,
              },
            },
            _count: {
              select: {
                reviews: true,
                favoriteProducts: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return favorites.map((favorite) => ({
      id: favorite.id,
      createdAt: favorite.createdAt,
      product: {
        ...favorite.product,
        averageRating:
          favorite.product.reviews.length > 0
            ? favorite.product.reviews.reduce(
                (sum, review) => sum + review.rating,
                0,
              ) / favorite.product.reviews.length
            : 0,
        reviewCount: favorite.product._count.reviews,
        favoriteCount: favorite.product._count.favoriteProducts,
      },
    }));
  }

  async isFavorite(userId: string, productId: string): Promise<boolean> {
    const favorite = await this.prisma.favoriteProduct.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    return !!favorite;
  }

  async toggleFavorite(userId: string, productId: string) {
    const isFav = await this.isFavorite(userId, productId);

    if (isFav) {
      await this.removeFromFavorites(userId, productId);
      return { isFavorite: false, message: 'Removed from favorites' };
    } else {
      await this.addToFavorites(userId, productId);
      return { isFavorite: true, message: 'Added to favorites' };
    }
  }

  async getFavoritesCount(userId: string): Promise<number> {
    return this.prisma.favoriteProduct.count({
      where: { userId },
    });
  }
}
