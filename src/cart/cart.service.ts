import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { Prisma } from '@prisma/client';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { buildSlugMap, normalizeLocale } from '../common/i18n.util';

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

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

  async addToCart(
    userId: string,
    addToCartDto: AddToCartDto,
    locale: string = 'en',
    currency: string = 'USD',
  ) {
    const { productId, quantity } = addToCartDto;
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (product.stock <= 0) {
      throw new BadRequestException('Product is not available');
    }

    if (product.stock < quantity) {
      throw new BadRequestException('Insufficient stock');
    }
    const existingCartItem = await this.prisma.cartItem.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    if (existingCartItem) {
      const newQuantity = existingCartItem.quantity + quantity;
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
            translations: true,
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
    if (quantity === 0) {
      return this.removeFromCart(userId, productId);
    }
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
      if (item.product.stock <= 0) {
        issues.push(this.localizeValidationIssue('PRODUCT_UNAVAILABLE', locale));
      }
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
    for (const guestItem of guestCartItems) {
      try {
        await this.addToCart(userId, {
          productId: guestItem.productId,
          quantity: guestItem.quantity,
        });
      } catch (error) {
        this.logger.error(
          `Failed to sync cart item ${guestItem.productId}: ${(error as Error).message}`,
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
    const normalizedLocale = this.normalizeLocale(locale);

    if (code === 'PRODUCT_UNAVAILABLE') {
      if (normalizedLocale === 'de') {
        return 'Produkt ist nicht mehr verfГјgbar';
      }
      return 'Product is no longer available';
    }

    const available = params?.available ?? 0;
    if (normalizedLocale === 'de') {
      return `Nur ${available} StГјck auf Lager`;
    }
    return `Only ${available} items in stock`;
  }
}
