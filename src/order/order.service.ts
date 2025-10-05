import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { CartService } from '../cart/cart.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class OrderService {
  constructor(
    private prisma: PrismaService,
    private cartService: CartService,
  ) {}

  async create(userId: string, createOrderDto: CreateOrderDto) {
    const orderItems = createOrderDto.items || [];

    // Validate stock availability
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

    // Calculate totals
    const subtotal = orderItems.reduce(
      (total, item) => total + item.price * item.quantity,
      0,
    );
    const shippingAmount = createOrderDto.shippingAmount || 0;
    const taxAmount = createOrderDto.taxAmount || subtotal * 0.1; // 10% tax
    const discountAmount = createOrderDto.discountAmount || 0;
    const totalAmount = subtotal + shippingAmount + taxAmount - discountAmount;

    // Generate order number
    const orderNumber = await this.generateOrderNumber();

    // Create order with transaction
    const order = await this.prisma.$transaction(async (tx) => {
      // Create order
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

      // Update product stock
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

      // Clear cart if items were from cart
      if (!createOrderDto.items || createOrderDto.items.length === 0) {
        await tx.cartItem.deleteMany({
          where: { userId },
        });
      }

      return newOrder;
    });

    return order;
  }

  async findAll(query: OrderQueryDto, userId?: string) {
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
        status ? { status } : {},
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
      }),
      this.prisma.order.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      orders,
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

  async findOne(id: string, userId?: string) {
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
            phone: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async findByOrderNumber(orderNumber: string, userId?: string) {
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
            phone: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async update(id: string, updateOrderDto: UpdateOrderDto) {
    const order = await this.prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return this.prisma.order.update({
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
  }

  async getUserOrders(userId: string, query: OrderQueryDto) {
    return this.findAll(query, userId);
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

  private async generateOrderNumber(): Promise<string> {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');

    const prefix = `ORD${year}${month}${day}`;

    // Find the latest order number for today
    const latestOrder = await this.prisma.order.findFirst({
      where: {
        orderNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        orderNumber: 'desc',
      },
    });

    let sequence = 1;
    if (latestOrder) {
      const lastSequence = parseInt(latestOrder.orderNumber.slice(-4));
      sequence = lastSequence + 1;
    }

    return `${prefix}${sequence.toString().padStart(4, '0')}`;
  }
}
