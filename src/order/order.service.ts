import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { CartService } from '../cart/cart.service';
import { Prisma } from '@prisma/client';
import { StripeService } from './stripe.service';
import { buildSlugMap, normalizeLocale } from '../common/i18n.util';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private prisma: PrismaService,
    private cartService: CartService,
    private stripeService: StripeService,
  ) {}

  async create(userId: string, createOrderDto: CreateOrderDto) {
    const orderItems = createOrderDto.items || [];
    for (const item of orderItems) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
      });

      if (!product) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }

      if (product.stock < item.quantity) {
        throw new BadRequestException(`Insufficient stock for ${product.name}`);
      }
    }
    const subtotal = orderItems.reduce(
      (total, item) => total + item.price * item.quantity,
      0,
    );
    const shippingAmount = createOrderDto.shippingAmount || 0;
    const taxAmount = createOrderDto.taxAmount || subtotal * 0.1; // 10% tax
    const discountAmount = createOrderDto.discountAmount || 0;
    const totalAmount = subtotal + shippingAmount + taxAmount - discountAmount;
    const order = await this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.generateOrderNumber(tx);
      const newOrder = await tx.order.create({
        data: {
          userId,
          orderNumber,
          totalAmount,
          shippingAmount,
          taxAmount,
          discountAmount,
          shippingAddress: createOrderDto.shippingAddress,
          shippingCity: createOrderDto.shippingCity,
          shippingCountry: createOrderDto.shippingCountry,
          shippingPostal: createOrderDto.shippingPostal,
          billingAddress: createOrderDto.billingAddress,
          billingCity: createOrderDto.billingCity,
          billingCountry: createOrderDto.billingCountry,
          billingPostal: createOrderDto.billingPostal,
          paymentMethod: createOrderDto.paymentMethod,
          orderItems: {
            create: orderItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.price,
              total: item.price * item.quantity,
            })),
          },
        },
        include: {
          orderItems: {
            include: {
              product: {
                include: {
                  images: true,
                },
              },
            },
          },
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
      for (const item of orderItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              decrement: item.quantity,
            },
          },
        });
      }
      if (!createOrderDto.items || createOrderDto.items.length === 0) {
        await tx.cartItem.deleteMany({
          where: { userId },
        });
      }

      return newOrder;
    });

    return order;
  }

  async findAll(query: OrderQueryDto, userId?: string, locale: string = 'en') {
    const {
      status,
      paymentStatus,
      orderNumber,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 10,
    } = query;

    const where: Prisma.OrderWhereInput = {
      AND: [
        userId ? { userId } : {},
        status?.length ? { status: { in: status } } : {},
        paymentStatus ? { paymentStatus } : {},
        orderNumber
          ? { orderNumber: { contains: orderNumber, mode: 'insensitive' } }
          : {},
      ],
    };

    const orderBy: Prisma.OrderOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          orderItems: {
            include: {
              product: {
                include: {
                  images: true,
                  translations: true,
                },
              },
            },
          },
          statusHistory: {
            orderBy: { createdAt: 'asc' },
          },
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      orders: orders.map((order) => this.normalizeOrderForFrontend(order, locale)),
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

  async findOne(id: string, userId?: string, locale: string = 'en') {
    const where: Prisma.OrderWhereInput = {
      id,
      ...(userId && { userId }),
    };

    const order = await this.prisma.order.findFirst({
      where,
      include: {
        orderItems: {
          include: {
              product: {
                include: {
                  images: true,
                  categories: true,
                  translations: true,
                },
              },
            },
          },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    }

    if (
      order.stripePaymentIntentId &&
      (order.paymentStatus !== 'REFUNDED' || order.status !== 'REFUNDED')
    ) {
      try {
        const paymentIntent = await this.stripeService.retrievePaymentIntent(
          order.stripePaymentIntentId,
          { expand: ['latest_charge'] },
        );

        const latestCharge =
          paymentIntent.latest_charge &&
          typeof paymentIntent.latest_charge !== 'string'
            ? paymentIntent.latest_charge
            : null;
        const shouldMarkRefunded =
          Boolean(latestCharge?.refunded) ||
          Number(latestCharge?.amount_refunded ?? 0) > 0;
        const shouldSyncPaymentStatus = order.paymentStatus === 'PENDING';
        const shouldMarkPaid =
          shouldSyncPaymentStatus && paymentIntent.status === 'succeeded';
        const shouldMarkFailed =
          shouldSyncPaymentStatus &&
          (paymentIntent.status === 'canceled' ||
            paymentIntent.status === 'requires_payment_method');
        let hasSyncedOrder = false;

        if (shouldMarkRefunded) {
          await this.prisma.$transaction(async (tx) => {
            await tx.order.update({
              where: { id: order.id },
              data: {
                paymentStatus: 'REFUNDED',
                status: 'REFUNDED',
                refundedAt: order.refundedAt ?? new Date(),
                cancelledFromStatus: order.cancelledFromStatus ?? order.status,
              },
            });

            const hasRefundHistory = order.statusHistory.some(
              (entry) => entry.status === 'REFUNDED',
            );
            if (!hasRefundHistory) {
              await tx.orderStatusHistory.create({
                data: {
                  orderId: order.id,
                  status: 'REFUNDED',
                  note: 'Refund synced from Stripe',
                },
              });
            }
          });
          hasSyncedOrder = true;
        } else if (shouldMarkPaid || shouldMarkFailed) {
          await this.prisma.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: shouldMarkPaid ? 'PAID' : 'FAILED',
              status: shouldMarkPaid ? 'CONFIRMED' : order.status,
            },
          });
          hasSyncedOrder = true;
        }

        if (hasSyncedOrder) {
          return this.findOne(id, userId, locale);
        }
      } catch (error) {
        this.logger.warn(
          `Stripe sync fallback failed for order ${order.id}: ${(error as Error).message}`,
        );
      }
    }

    return this.normalizeOrderForFrontend(order, locale);
  }

  async findByOrderNumber(
    orderNumber: string,
    userId?: string,
    locale: string = 'en',
  ) {
    const where: Prisma.OrderWhereInput = {
      orderNumber,
      ...(userId && { userId }),
    };

    const order = await this.prisma.order.findFirst({
      where,
      include: {
        orderItems: {
          include: {
              product: {
                include: {
                  images: true,
                  categories: true,
                  translations: true,
                },
              },
            },
          },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    }

    return this.normalizeOrderForFrontend(order, locale);
  }

  async cancelOrder(id: string, userId: string, locale: string = 'en') {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: { orderItems: true },
    });

    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    }

    if (order.status === 'CANCELLED') {
      return this.findOne(id, userId, locale);
    }

    if (order.status === 'DELIVERED' || order.status === 'REFUNDED') {
      throw new BadRequestException({ code: 'ORDER_CANNOT_BE_CANCELLED' });
    }

    if (order.stripePaymentIntentId && order.paymentStatus === 'PAID') {
      try {
        await this.stripeService.refundPaymentIntent(order.stripePaymentIntentId);
      } catch (error) {
        this.logger.error(
          `Failed to refund payment intent ${order.stripePaymentIntentId}: ${(error as Error).message}`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: {
          cancelledFromStatus: order.status,
          cancelledAt: new Date(),
          status: 'CANCELLED',
          refundedAt: order.paymentStatus === 'PAID' ? new Date() : null,
          paymentStatus:
            order.paymentStatus === 'PAID' ? 'REFUNDED' : order.paymentStatus,
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          status: 'CANCELLED',
          note: `Cancelled from ${order.status}`,
        },
      });
    });

    return this.findOne(id, userId, locale);
  }

  async update(id: string, updateOrderDto: UpdateOrderDto) {
    const order = await this.prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    }

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id },
        data: updateOrderDto,
        include: {
          orderItems: {
            include: {
              product: {
                include: {
                  images: true,
                },
              },
            },
          },
          statusHistory: {
            orderBy: { createdAt: 'asc' },
          },
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (updateOrderDto.status) {
        await tx.orderStatusHistory.create({
          data: { orderId: id, status: updateOrderDto.status },
        });
      }

      return result;
    });

    return this.normalizeOrderForFrontend(updatedOrder, 'en');
  }

  async getUserOrders(userId: string, query: OrderQueryDto, locale: string = 'en') {
    return this.findAll(query, userId, locale);
  }

  async getOrderStats(userId?: string) {
    const where = userId ? { userId } : {};

    const [
      totalOrders,
      pendingOrders,
      confirmedOrders,
      shippedOrders,
      deliveredOrders,
      cancelledOrders,
      totalRevenue,
    ] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.count({ where: { ...where, status: 'PENDING' } }),
      this.prisma.order.count({ where: { ...where, status: 'CONFIRMED' } }),
      this.prisma.order.count({ where: { ...where, status: 'SHIPPED' } }),
      this.prisma.order.count({ where: { ...where, status: 'DELIVERED' } }),
      this.prisma.order.count({ where: { ...where, status: 'CANCELLED' } }),
      this.prisma.order.aggregate({
        where: { ...where, status: { not: 'CANCELLED' } },
        _sum: { totalAmount: true },
      }),
    ]);

    return {
      totalOrders,
      pendingOrders,
      confirmedOrders,
      shippedOrders,
      deliveredOrders,
      cancelledOrders,
      totalRevenue: totalRevenue._sum.totalAmount || 0,
    };
  }

  private normalizeOrderForFrontend(order: any, locale: string) {
    const normalizedLocale = normalizeLocale(locale);
    const {
      shippingAddress,
      shippingCity,
      shippingPostal,
      shippingNumberOfApartment,
      statusHistory: _statusHistory,
      orderItems,
      ...rest
    } = order;

    const localizedItems = (orderItems || []).map((item: any) => ({
      ...item,
      price: Number(item.price ?? 0),
      total: Number(item.total ?? 0),
      product: this.localizeOrderProduct(item.product, normalizedLocale),
    }));

    const subtotalAmount =
      Number(order.totalAmount ?? 0) -
      Number(order.shippingAmount ?? 0) -
      Number(order.taxAmount ?? 0) -
      Number(order.tipAmount ?? 0) +
      Number(order.discountAmount ?? 0);

    return {
      ...rest,
      totalAmount: Number(order.totalAmount ?? 0),
      shippingAmount: Number(order.shippingAmount ?? 0),
      taxAmount: Number(order.taxAmount ?? 0),
      discountAmount: Number(order.discountAmount ?? 0),
      tipAmount: Number(order.tipAmount ?? 0),
      subtotalAmount,
      shippingAddress: {
        streetAddress: shippingAddress,
        city: shippingCity,
        zipCode: shippingPostal,
        numberOfApartment: shippingNumberOfApartment ?? null,
      },
      orderItems: localizedItems,
      timeline: this.buildOrderTimeline(order),
    };
  }

  private localizeOrderProduct(product: any, locale: string) {
    if (!product) return product;

    const normalizedLocale = normalizeLocale(locale);
    const translation = product.translations?.find(
      (t: any) => t.locale === normalizedLocale,
    );

    if (!translation) {
      return {
        ...product,
        slugMap: buildSlugMap(product.slug, product.translations),
        price: Number(product.price ?? 0),
        oldPrice:
          product.oldPrice !== null && product.oldPrice !== undefined
            ? Number(product.oldPrice)
            : undefined,
        translations: undefined,
      };
    }

    return {
      ...product,
      name: translation.name,
      slug: translation.slug,
      slugMap: buildSlugMap(product.slug, product.translations),
      shortDescription: translation.shortDescription,
      description: translation.description,
      price: Number(product.price ?? 0),
      oldPrice:
        product.oldPrice !== null && product.oldPrice !== undefined
          ? Number(product.oldPrice)
          : undefined,
      translations: undefined,
    };
  }

  private buildOrderTimeline(order: any) {
    const statusHistory: Array<{ status: string; note?: string; createdAt: Date }> =
      order.statusHistory || [];

    const displaySteps = ['ORDER_PLACED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
    const stepIndex: Record<string, number> = {
      ORDER_PLACED: 0,
      PROCESSING: 1,
      SHIPPED: 2,
      DELIVERED: 3,
    };
    const toDisplayStep = (status: string): string => {
      if (status === 'PROCESSING' || status === 'SHIPPED' || status === 'DELIVERED') {
        return status;
      }
      return 'ORDER_PLACED';
    };
    const toIso = (value?: Date | null) => (value ? value.toISOString() : null);

    const findStepMeta = (
      step: string,
    ): { timestamp: string | null; note?: string } => {
      if (step === 'ORDER_PLACED') {
        const placed = statusHistory.find(
          (h) => h.status === 'PENDING' || h.status === 'CONFIRMED',
        );
        return { timestamp: placed ? toIso(placed.createdAt) : toIso(order.createdAt) };
      }

      const event = statusHistory.find((h) => h.status === step);
      return {
        timestamp: event ? toIso(event.createdAt) : null,
        ...(event?.note ? { note: event.note } : {}),
      };
    };

    const isTerminal = order.status === 'CANCELLED' || order.status === 'REFUNDED';
    const terminalFrom = order.cancelledFromStatus ?? 'PENDING';
    const currentDisplayStep = isTerminal ? terminalFrom : order.status;
    const currentIndex = stepIndex[toDisplayStep(currentDisplayStep)] ?? 0;

    const baseTimeline = displaySteps.map((step, index) => {
      const meta = findStepMeta(step);
      const isCompleted = index <= currentIndex;
      const hasNextStageStarted = index < currentIndex;
      return {
        id: step.toLowerCase(),
        status: step,
        timestamp: isCompleted ? meta.timestamp : null,
        progress: isCompleted
          ? isTerminal || hasNextStageStarted
            ? 100
            : 70
          : 0,
        ...(meta.note ? { note: meta.note } : {}),
      };
    });

    if (!isTerminal) {
      return baseTimeline;
    }

    const cancelledHistory = statusHistory.find((h) => h.status === 'CANCELLED');
    const refundedHistory = statusHistory.find((h) => h.status === 'REFUNDED');
    const isRefunded = order.status === 'REFUNDED';

    const cancelledEvent = {
      id: 'cancelled',
      status: 'CANCELLED',
      timestamp: toIso(order.cancelledAt ?? cancelledHistory?.createdAt ?? order.updatedAt),
      progress: 100,
      note: cancelledHistory?.note ?? `Cancelled from ${toDisplayStep(terminalFrom)}`,
    };

    const refundedEvent = {
      id: 'refunded',
      status: 'REFUNDED',
      timestamp: isRefunded
        ? toIso(order.refundedAt ?? refundedHistory?.createdAt ?? order.updatedAt)
        : null,
      progress: 0,
      ...(isRefunded
        ? refundedHistory?.note
          ? { note: refundedHistory.note }
          : { note: 'Refunded after CANCELLED' }
        : {}),
    };

    const insertAt = currentIndex + 1;
    const completed = baseTimeline.slice(0, insertAt);
    const upcoming = baseTimeline.slice(insertAt);

    return [...completed, cancelledEvent, refundedEvent, ...upcoming];
  }

  private async generateOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const dateKey = `${date.getFullYear()}-${month}-${day}`;
    const prefix = `ORD${year}${month}${day}`;
    const counter = await tx.orderNumberCounter.upsert({
      where: { dateKey },
      update: {
        nextNumber: {
          increment: 1,
        },
      },
      create: {
        dateKey,
        nextNumber: 1,
      },
    });

    return `${prefix}${counter.nextNumber.toString().padStart(4, '0')}`;
  }
}
