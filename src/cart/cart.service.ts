import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  async addToCart(userId: string, addToCartDto: AddToCartDto) {
    const { productId, quantity } = addToCartDto;

    // Check if product exists and is active
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Check stock availability
    if (product.stock <= 0) {
      throw new BadRequestException('Product is not available');
    }

    if (product.stock < quantity) {
      throw new BadRequestException('Insufficient stock');
    }

    // Check if item already exists in cart
    const existingCartItem = await this.prisma.cartItem.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    if (existingCartItem) {
      // Update quantity if item exists
      const newQuantity = existingCartItem.quantity + quantity;

      // Check stock for new quantity
      if (product.stock < newQuantity) {
        throw new BadRequestException(
          'Insufficient stock for requested quantity',
        );
      }

      return this.prisma.cartItem.update({
        where: {
          userId_productId: {
            userId,
            productId,
          },
        },
        data: {
          quantity: newQuantity,
        },
        include: {
          product: {
            include: {
              images: true,
              categories: true,
            },
          },
        },
      });
    } else {
      // Create new cart item
      return this.prisma.cartItem.create({
        data: {
          userId,
          productId,
          quantity,
        },
        include: {
          product: {
            include: {
              images: true,
              categories: true,
            },
          },
        },
      });
    }
  }

  async getCart(userId: string) {
    const cartItems = await this.prisma.cartItem.findMany({
      where: { userId },
      include: {
        product: {
          include: {
            images: true,
            categories: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Calculate totals
    const subtotal = cartItems.reduce((total, item) => {
      const itemProduct = item as any;
      const price =
        itemProduct.product.price instanceof Prisma.Decimal
          ? itemProduct.product.price.toNumber()
          : Number(itemProduct.product.price);
      return total + price * item.quantity;
    }, 0);

    const totalItems = cartItems.reduce(
      (total, item) => total + item.quantity,
      0,
    );

    return {
      items: cartItems,
      totals: {
        subtotal,
        totalItems,
        estimatedShipping: 0, // Can be calculated based on business logic
        estimatedTax: subtotal * 0.1, // 10% tax rate as example
        total: subtotal + subtotal * 0.1,
      },
    };
  }

  async updateCartItem(
    userId: string,
    productId: string,
    updateCartItemDto: UpdateCartItemDto,
  ) {
    const { quantity } = updateCartItemDto;

    // Check if cart item exists
    const cartItem = await this.prisma.cartItem.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
      include: {
        product: true,
      },
    });

    if (!cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    // If quantity is 0, remove item
    if (quantity === 0) {
      return this.removeFromCart(userId, productId);
    }

    // Check stock availability
    if (cartItem.product.stock < quantity) {
      throw new BadRequestException('Insufficient stock');
    }

    return this.prisma.cartItem.update({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
      data: {
        quantity,
      },
      include: {
        product: {
          include: {
            images: true,
            categories: true,
          },
        },
      },
    });
  }

  async removeFromCart(userId: string, productId: string) {
    const cartItem = await this.prisma.cartItem.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    if (!cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    return this.prisma.cartItem.delete({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });
  }

  async clearCart(userId: string) {
    return this.prisma.cartItem.deleteMany({
      where: { userId },
    });
  }

  async getCartItemsCount(userId: string): Promise<number> {
    const result = await this.prisma.cartItem.aggregate({
      where: { userId },
      _sum: {
        quantity: true,
      },
    });

    return result._sum.quantity || 0;
  }

  async validateCartItems(userId: string) {
    const cartItems = await this.prisma.cartItem.findMany({
      where: { userId },
      include: {
        product: true,
      },
    });

    const validationResults: any[] = [];

    for (const item of cartItems) {
      const issues: string[] = [];

      // Check if product is still available
      if (item.product.stock <= 0) {
        issues.push('Product is no longer available');
      }

      // Check stock availability
      if (item.product.stock < item.quantity) {
        issues.push(`Only ${item.product.stock} items in stock`);
      }

      validationResults.push({
        cartItemId: item.id,
        productId: item.productId,
        requestedQuantity: item.quantity,
        availableQuantity: item.product.stock,
        isValid: issues.length === 0,
        issues,
      });
    }

    return validationResults;
  }

  async syncCartAfterLogin(guestCartItems: any[], userId: string) {
    // Merge guest cart with user's existing cart
    for (const guestItem of guestCartItems) {
      try {
        await this.addToCart(userId, {
          productId: guestItem.productId,
          quantity: guestItem.quantity,
        });
      } catch (error) {
        // Log error but continue with other items
        console.error(
          `Failed to sync cart item ${guestItem.productId}:`,
          error.message,
        );
      }
    }

    return this.getCart(userId);
  }
}
