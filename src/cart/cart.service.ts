import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { Prisma } from '@prisma/client';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';

@Injectable()
export class CartService {
  constructor(
    private prisma: PrismaService,
    private exchangeRateService: ExchangeRateService,
  ) {}

  async addToCart(
    userId: string,
    addToCartDto: AddToCartDto,
    locale: string = 'en',
    currency: string = 'USD',
  ) {
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

      await this.prisma.cartItem.update({
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
      return this.getCart(userId, locale, currency);
    } else {
      // Create new cart item
      await this.prisma.cartItem.create({
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
      return this.getCart(userId, locale, currency);
    }
  }

  async getCart(
    userId: string,
    locale: string = 'en',
    currency: string = 'USD',
  ) {
    const normalizedCurrency = (currency || 'USD').toUpperCase();
    const cartItems = await this.prisma.cartItem.findMany({
      where: { userId },
      include: {
        product: {
          include: {
            images: true,
            categories: true,
            translations: locale
              ? {
                  where: { locale },
                }
              : true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const transformedCartItems = await Promise.all(
      cartItems.map(async (item) => ({
        ...item,
        product: await this.localizeAndConvertCartProduct(
          item.product as any,
          locale,
          normalizedCurrency,
        ),
      })),
    );

    // Calculate totals
    const subtotal = transformedCartItems.reduce((total, item) => {
      const itemProduct = item.product as any;
      const price =
        itemProduct.price instanceof Prisma.Decimal
          ? itemProduct.price.toNumber()
          : Number(itemProduct.price);
      return total + price * item.quantity;
    }, 0);

    const totalItems = transformedCartItems.reduce(
      (total, item) => total + item.quantity,
      0,
    );

    const estimatedShipping = 0;
    const estimatedTax = subtotal * 0.1;

    return {
      items: transformedCartItems,
      totals: {
        subtotal,
        freeShippingTarget: 200,
        totalItems,
        estimatedShipping,
        estimatedTax,
        total: subtotal + estimatedShipping + estimatedTax,
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

  async validateCartItems(userId: string, locale: string = 'en') {
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
        issues.push(this.localizeValidationIssue('PRODUCT_UNAVAILABLE', locale));
      }

      // Check stock availability
      if (item.product.stock < item.quantity) {
        issues.push(
          this.localizeValidationIssue('INSUFFICIENT_STOCK', locale, {
            available: item.product.stock,
          }),
        );
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

  async syncCartAfterLogin(
    guestCartItems: any[],
    userId: string,
    locale: string = 'en',
    currency: string = 'USD',
  ) {
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

    return this.getCart(userId, locale, currency);
  }

  private async localizeAndConvertCartProduct(
    product: any,
    locale: string,
    currency: string,
  ) {
    const translation =
      product.translations?.find((t: any) => t.locale === locale) ||
      product.translations?.[0];

    if (translation) {
      product.name = translation.name;
      product.slug = translation.slug;
      product.shortDescription = translation.shortDescription;
      product.description = translation.description;
    }

    const basePrice =
      product.price instanceof Prisma.Decimal
        ? product.price.toNumber()
        : Number(product.price);

    product.price =
      currency !== 'USD'
        ? await this.exchangeRateService.convertPrice(basePrice, 'USD', currency)
        : basePrice;

    if (product.oldPrice !== null && product.oldPrice !== undefined) {
      const baseOldPrice =
        product.oldPrice instanceof Prisma.Decimal
          ? product.oldPrice.toNumber()
          : Number(product.oldPrice);
      product.oldPrice =
        currency !== 'USD'
          ? await this.exchangeRateService.convertPrice(
              baseOldPrice,
              'USD',
              currency,
            )
          : baseOldPrice;
    }

    delete product.translations;
    return product;
  }

  private localizeValidationIssue(
    code: 'PRODUCT_UNAVAILABLE' | 'INSUFFICIENT_STOCK',
    locale: string,
    params?: { available?: number },
  ): string {
    const normalizedLocale = locale || 'en';

    if (code === 'PRODUCT_UNAVAILABLE') {
      if (normalizedLocale === 'de') {
        return 'Produkt ist nicht mehr verfügbar';
      }
      return 'Product is no longer available';
    }

    const available = params?.available ?? 0;
    if (normalizedLocale === 'de') {
      return `Nur ${available} Stück auf Lager`;
    }
    return `Only ${available} items in stock`;
  }
}
