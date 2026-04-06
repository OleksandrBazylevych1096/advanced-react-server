import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  CheckoutSession,
  CheckoutSessionStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import Stripe from 'stripe';
import { CartService } from '../cart/cart.service';
import { DeliverySelectionService } from '../delivery-selection/delivery-selection.service';
import { EmailService } from '../email/email.service';
import { StripeService } from '../order/stripe.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentSessionDto } from './dto/create-payment-session.dto';

type SnapshotItem = {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
};

type CheckoutSnapshot = {
  shippingAddress: string;
  shippingCity: string;
  shippingCountry: string;
  shippingPostal: string;
  shippingNumberOfApartment?: string;
  billingAddress?: string;
  billingCity?: string;
  billingCountry?: string;
  billingPostal?: string;
  paymentMethod: string;
  tipAmount: number;
  couponCode?: string;
  couponDiscountAmount: number;
  deliveryDate?: string;
  deliveryTime?: string;
  items: SnapshotItem[];
};

type CouponEvaluation = {
  code: string | null;
  isValid: boolean;
  discountAmount: number;
  displayText?: string;
  promotionCodeId?: string;
  message?: string;
};

type CheckoutPricing = {
  subtotal: number;
  shippingAmount: number;
  taxAmount: number;
  tipAmount: number;
  discountAmount: number;
  baseTotalAmount: number;
  totalAmount: number;
  coupon: CouponEvaluation;
};

type PaymentCardSnapshot = {
  brand: string | null;
  last4: string | null;
};

@Injectable()
export class CheckoutService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CheckoutService.name);
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly cartService: CartService,
    private readonly deliverySelectionService: DeliverySelectionService,
    private readonly emailService: EmailService,
    private readonly stripeService: StripeService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    const cleanupMs = this.getCleanupIntervalMs();
    this.cleanupTimer = setInterval(() => {
      this.expireStaleSessions().catch((error) => {
        this.logger.error(
          `Checkout session cleanup failed: ${(error as Error).message}`,
        );
      });
    }, cleanupMs);

    this.expireStaleSessions().catch((error) => {
      this.logger.warn(
        `Initial checkout session cleanup failed: ${(error as Error).message}`,
      );
    });
  }

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private normalizeOrderResponse<
    T extends {
      shippingAddress: string;
      shippingCity: string;
      shippingCountry: string;
      shippingPostal: string;
      shippingNumberOfApartment?: string | null;
      totalAmount?: Prisma.Decimal | number | string | null;
      shippingAmount?: Prisma.Decimal | number | string | null;
      taxAmount?: Prisma.Decimal | number | string | null;
      tipAmount?: Prisma.Decimal | number | string | null;
      discountAmount?: Prisma.Decimal | number | string | null;
    },
  >(order: T) {
    const {
      shippingAddress,
      shippingCity,
      shippingCountry: _shippingCountry,
      shippingPostal,
      shippingNumberOfApartment,
      ...rest
    } = order;

    const subtotal =
      Number(order.totalAmount ?? 0) -
      Number(order.shippingAmount ?? 0) -
      Number(order.taxAmount ?? 0) -
      Number(order.tipAmount ?? 0) +
      Number(order.discountAmount ?? 0);
    const normalizedOrderItems = Array.isArray((rest as any).orderItems)
      ? (rest as any).orderItems.map((item: any) => ({
          ...item,
          price: Number(item.price ?? 0),
          total: Number(item.total ?? 0),
        }))
      : (rest as any).orderItems;

    return {
      ...rest,
      totalAmount: Number(order.totalAmount ?? 0),
      shippingAmount: Number(order.shippingAmount ?? 0),
      taxAmount: Number(order.taxAmount ?? 0),
      tipAmount: Number(order.tipAmount ?? 0),
      discountAmount: Number(order.discountAmount ?? 0),
      subtotalAmount: subtotal,
      orderItems: normalizedOrderItems,
      shippingAddress: {
        streetAddress: shippingAddress,
        city: shippingCity,
        zipCode: shippingPostal,
        numberOfApartment: shippingNumberOfApartment ?? null,
      },
    };
  }

  async getSummary(
    userId: string,
    locale: string = 'en',
    currency: string = 'USD',
    couponCode?: string,
    tipAmount?: number,
  ) {
    const cart = await this.cartService.getCart(userId, locale, currency);
    const validation = await this.cartService.validateCartItems(userId, locale);
    const pricing = await this.calculateCheckoutPricing(
      this.toNumber(cart.totals.subtotal),
      this.toNumber(cart.totals.estimatedShipping),
      this.toNumber(cart.totals.estimatedTax),
      currency,
      tipAmount,
      couponCode,
      false,
    );

    return {
      ...cart,
      totals: {
        ...cart.totals,
        tipAmount: pricing.tipAmount,
        discountAmount: pricing.discountAmount,
        total: pricing.totalAmount,
      },
      coupon: pricing.coupon,
      validation,
    };
  }

  async validateCoupon(
    userId: string,
    locale: string = 'en',
    currency: string = 'USD',
    couponCode?: string,
  ) {
    const cart = await this.cartService.getCart(userId, locale, currency);
    const coupon = await this.evaluateCoupon(
      couponCode,
      this.toNumber(cart.totals.subtotal),
      currency,
      false,
    );

    return coupon;
  }

  async createPaymentSession(userId: string, dto: CreatePaymentSessionDto) {
    if (!this.stripeService.isEnabled()) {
      throw new BadRequestException(
        'Stripe payment is unavailable. Configure STRIPE_SECRET_KEY.',
      );
    }

    await this.expireStaleSessions(userId);

    const normalizedCurrency = this.normalizeCurrency(dto.currency);
    const resolvedLocale = dto.locale || 'en';
    const displayCurrency = normalizedCurrency.toUpperCase();
    const prepared = await this.prepareSessionPayload(
      userId,
      dto,
      resolvedLocale,
      displayCurrency,
      normalizedCurrency,
    );
    const now = new Date();

    const activeSession = await this.prisma.checkoutSession.findFirst({
      where: {
        userId,
        cartHash: prepared.cartHash,
        status: CheckoutSessionStatus.pending_payment,
        expiresAt: {
          gt: now,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (activeSession) {
      const reusableResponse =
        await this.buildReusableCheckoutSessionResponse(activeSession);
      if (reusableResponse) {
        return reusableResponse;
      }

      try {
        if (this.isPaymentIntentRef(activeSession.paymentIntentId)) {
          const paymentIntent = await this.stripeService.retrievePaymentIntent(
            activeSession.paymentIntentId,
          );

          if (
            paymentIntent.status !== 'canceled' &&
            paymentIntent.status !== 'succeeded'
          ) {
            await this.stripeService.cancelPaymentIntent(activeSession.paymentIntentId);
          }
        } else {
          const checkoutSessionId = this.checkoutSessionIdFromRef(
            activeSession.paymentIntentId,
          );
          if (checkoutSessionId) {
            await this.stripeService.expireCheckoutSession(checkoutSessionId);
          }
        }
      } catch (error) {
        this.logger.warn(
          `Failed to cancel/expire replaced payment session ${activeSession.paymentIntentId}: ${(error as Error).message}`,
        );
      }

      await this.transitionSessionStatus(
        activeSession.id,
        CheckoutSessionStatus.cancelled,
        'session_replaced',
        {
          paymentIntentId: activeSession.paymentIntentId,
        },
      );
    }

    const sessionId = randomUUID();
    const successUrl = this.attachSessionIdToUrl(dto.successUrl, sessionId);
    const cancelUrl = this.attachSessionIdToUrl(dto.cancelUrl, sessionId);
    const stripeLocale = this.normalizeStripeCheckoutLocale(resolvedLocale);
    const customerEmail = await this.getStripeCheckoutCustomerEmail(userId);
    const stripeMetadata: Stripe.MetadataParam = {
      userId,
      cartHash: prepared.cartHash,
      checkoutSessionId: sessionId,
      couponDiscountAmount: prepared.discountAmount.toFixed(2),
    };
    if (prepared.couponCode) {
      stripeMetadata.couponCode = prepared.couponCode;
    }

    let stripeCheckoutSession: Stripe.Checkout.Session;
    try {
      stripeCheckoutSession = await this.stripeService.createCheckoutSession({
        amountInMinor: this.toStripeMinorAmount(prepared.totalAmount),
        lineItems: prepared.stripeLineItems,
        currency: normalizedCurrency,
        locale: stripeLocale,
        successUrl,
        cancelUrl,
        customerEmail,
        metadata: stripeMetadata,
      });
    } catch (error) {
      const message = (error as { message?: string })?.message;
      throw new BadRequestException(
        message || 'Failed to create Stripe checkout session',
      );
    }

    const paymentIntentDetails =
      typeof stripeCheckoutSession.payment_intent === 'string'
        ? await this.stripeService.retrievePaymentIntent(
            stripeCheckoutSession.payment_intent,
          )
        : stripeCheckoutSession.payment_intent;

    const paymentIntentRef =
      paymentIntentDetails?.id || `checkout:${stripeCheckoutSession.id}`;
    const amountMinor =
      stripeCheckoutSession.amount_total ??
      paymentIntentDetails?.amount ??
      this.toStripeMinorAmount(prepared.totalAmount);
    const effectiveDiscount = this.roundMoney(prepared.discountAmount);

    const session = await this.prisma.checkoutSession.create({
      data: {
        id: sessionId,
        userId,
        cartHash: prepared.cartHash,
        amount: new Prisma.Decimal(this.fromStripeMinorAmount(amountMinor)),
        currency: normalizedCurrency,
        paymentIntentId: paymentIntentRef,
        status: CheckoutSessionStatus.pending_payment,
        shippingAmount: new Prisma.Decimal(prepared.shippingAmount),
        taxAmount: new Prisma.Decimal(prepared.taxAmount),
        discountAmount: new Prisma.Decimal(effectiveDiscount),
        tipAmount: new Prisma.Decimal(prepared.tipAmount),
        couponCode: prepared.couponCode ?? null,
        snapshot: prepared.snapshot as Prisma.InputJsonValue,
        expiresAt: prepared.expiresAt,
      },
    });

    await this.logSessionEvent({
      sessionId: session.id,
      fromStatus: null,
      toStatus: CheckoutSessionStatus.pending_payment,
      reason: 'session_created',
      metadata: {
        cartHash: prepared.cartHash,
        paymentIntentId: paymentIntentRef,
        stripeCheckoutSessionId: stripeCheckoutSession.id,
      },
    });

    return this.toPaymentSessionResponse(
      session,
      paymentIntentDetails,
      stripeCheckoutSession.url ?? undefined,
      stripeCheckoutSession.id,
    );
  }

  async getPaymentSession(userId: string, sessionId: string) {
    const session = await this.prisma.checkoutSession.findUnique({
      where: { id: sessionId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentStatus: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Checkout session not found');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('Checkout session access denied');
    }

    if (
      session.status === CheckoutSessionStatus.pending_payment &&
      session.expiresAt <= new Date()
    ) {
      await this.transitionSessionStatus(
        session.id,
        CheckoutSessionStatus.expired,
        'expired_on_read',
      );
      session.status = CheckoutSessionStatus.expired;
    }

    const paymentIntent = await this.resolveSessionPaymentIntent(session);
    let resolvedOrder = session.order ?? null;

    if (session.status === CheckoutSessionStatus.pending_payment && paymentIntent) {
      if (paymentIntent.status === 'succeeded') {
        const order = await this.finalizePaidSession(
          session,
          paymentIntent,
          'poll_status_sync',
        );
        session.status = CheckoutSessionStatus.paid;
        resolvedOrder = {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
        };
      } else if (
        paymentIntent.status === 'canceled' ||
        paymentIntent.status === 'requires_payment_method'
      ) {
        const nextStatus =
          paymentIntent.status === 'canceled'
            ? CheckoutSessionStatus.cancelled
            : CheckoutSessionStatus.payment_failed;

        await this.transitionSessionStatus(
          session.id,
          nextStatus,
          'poll_status_sync_failed',
          {
            paymentIntentStatus: paymentIntent.status,
          },
        );
        session.status = nextStatus;
      }
    }

    return {
      sessionId: session.id,
      stripePaymentIntentId: session.paymentIntentId,
      stripeClientSecret: paymentIntent?.client_secret ?? '',
      status: session.status,
      currency: session.currency,
      amount: this.toNumber(session.amount),
      tipAmount: this.toNumber(session.tipAmount),
      discountAmount: this.toNumber(session.discountAmount),
      couponCode: session.couponCode,
      expiresAt: session.expiresAt,
      order: resolvedOrder,
    };
  }

  async confirmPayment(userId: string, sessionId: string) {
    const session = await this.prisma.checkoutSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Checkout session not found');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('Checkout session access denied');
    }

    if (session.status === CheckoutSessionStatus.paid && session.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: session.orderId },
        include: {
          orderItems: {
            include: {
              product: {
                include: { images: true },
              },
            },
          },
        },
      });

      return order ? this.normalizeOrderResponse(order) : null;
    }

    const paymentIntent = await this.resolveSessionPaymentIntent(session);

    if (!paymentIntent) {
      return {
        sessionId: session.id,
        stripePaymentIntentId: session.paymentIntentId,
        stripeClientSecret: '',
        status: session.status,
      };
    }

    if (paymentIntent.status === 'succeeded') {
      const order = await this.finalizePaidSession(
        session,
        paymentIntent,
        'manual_confirm',
      );
      return this.normalizeOrderResponse(order);
    }

    if (
      paymentIntent.status === 'canceled' ||
      paymentIntent.status === 'requires_payment_method'
    ) {
      const nextStatus =
        paymentIntent.status === 'canceled'
          ? CheckoutSessionStatus.cancelled
          : CheckoutSessionStatus.payment_failed;

      await this.transitionSessionStatus(
        session.id,
        nextStatus,
        'manual_confirm_failed',
        {
          paymentIntentStatus: paymentIntent.status,
        },
      );
    }

    return {
      sessionId: session.id,
      stripePaymentIntentId: session.paymentIntentId,
      stripeClientSecret: paymentIntent.client_secret,
      status: paymentIntent.status,
    };
  }

  async processStripeWebhook(payload: Buffer, signature: string) {
    let event: Stripe.Event;
    try {
      event = this.stripeService.constructWebhookEvent(payload, signature);
    } catch (error) {
      this.logger.error(
        `Stripe webhook signature verification failed: ${(error as Error).message}`,
      );
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object;
          const result = await this.finalizePaidByPaymentIntent(
            paymentIntent,
            'webhook_succeeded',
          );
          return {
            received: true,
            type: event.type,
            sessionId: result?.sessionId ?? null,
            orderId: result?.orderId ?? null,
          };
        }
        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object;
          await this.handlePaymentFailure(
            paymentIntent.id,
            'webhook_payment_failed',
            paymentIntent.last_payment_error?.message ?? undefined,
          );
          return { received: true, type: event.type };
        }
        case 'payment_intent.canceled': {
          const paymentIntent = event.data.object;
          await this.transitionSessionByIntent(
            paymentIntent.id,
            CheckoutSessionStatus.cancelled,
            'webhook_canceled',
          );
          return { received: true, type: event.type };
        }
        default:
          return { received: true, type: event.type, ignored: true };
      }
    } catch (error) {
      this.logger.error(
        `Stripe webhook processing failed for event ${event.type}: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException('Stripe webhook processing failed');
    }
  }

  private async prepareSessionPayload(
    userId: string,
    dto: CreatePaymentSessionDto,
    locale: string,
    displayCurrency: string,
    currency: string,
  ) {
    const cart = await this.cartService.getCart(userId, locale, displayCurrency);

    if (!cart.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    const invalidItems = (
      await this.cartService.validateCartItems(userId, locale)
    ).filter((item) => !item.isValid);

    if (invalidItems.length) {
      throw new BadRequestException({
        message: 'Cart contains invalid items',
        invalidItems,
      });
    }

    const storedDeliverySelection =
      !dto.deliveryDate || !dto.deliveryTime
        ? await this.deliverySelectionService.getStoredSelection(userId)
        : null;

    const deliveryDate = dto.deliveryDate || storedDeliverySelection?.deliveryDate;
    const deliveryTime = dto.deliveryTime || storedDeliverySelection?.deliveryTime;
    const pricing = await this.calculateCheckoutPricing(
      this.toNumber(cart.totals.subtotal),
      this.toNumber(cart.totals.estimatedShipping),
      this.toNumber(cart.totals.estimatedTax),
      currency,
      dto.tipAmount,
      dto.couponCode,
      true,
    );

    const snapshot: CheckoutSnapshot = {
      shippingAddress: dto.shippingAddress,
      shippingCity: dto.shippingCity,
      shippingCountry: dto.shippingCountry,
      shippingPostal: dto.shippingPostal,
      shippingNumberOfApartment: dto.shippingNumberOfApartment,
      billingAddress: dto.billingAddress,
      billingCity: dto.billingCity,
      billingCountry: dto.billingCountry,
      billingPostal: dto.billingPostal,
      paymentMethod: (dto.paymentMethod || 'stripe').toLowerCase(),
      tipAmount: pricing.tipAmount,
      couponCode: pricing.coupon.code || undefined,
      couponDiscountAmount: pricing.discountAmount,
      deliveryDate,
      deliveryTime,
      items: cart.items
        .map((item) => {
          const price = this.toNumber(item.product.price);
          return {
            productId: item.productId,
            productName: item.product.name,
            quantity: item.quantity,
            price,
            total: this.roundMoney(price * item.quantity),
          };
        })
        .sort((a, b) => a.productId.localeCompare(b.productId)),
    };

    const cartHash = this.buildCartHash({
      currency,
      subtotal: this.toNumber(cart.totals.subtotal),
      shippingAmount: pricing.shippingAmount,
      taxAmount: pricing.taxAmount,
      discountAmount: pricing.discountAmount,
      tipAmount: pricing.tipAmount,
      totalAmount: pricing.totalAmount,
      deliveryDate,
      deliveryTime,
      snapshot,
    });

    const expiresAt = new Date(
      Date.now() + this.getSessionTtlMinutes() * 60 * 1000,
    );

    return {
      cartHash,
      snapshot,
      stripeLineItems: this.buildStripeLineItems({
        currency,
        items: snapshot.items,
        shippingAmount: pricing.shippingAmount,
        taxAmount: pricing.taxAmount,
        tipAmount: pricing.tipAmount,
        discountAmount: pricing.discountAmount,
      }),
      shippingAmount: pricing.shippingAmount,
      taxAmount: pricing.taxAmount,
      discountAmount: pricing.discountAmount,
      tipAmount: pricing.tipAmount,
      couponCode: pricing.coupon.code || undefined,
      couponDisplayText: pricing.coupon.displayText,
      baseTotalAmount: pricing.baseTotalAmount,
      totalAmount: pricing.totalAmount,
      expiresAt,
    };
  }

  private async finalizePaidByPaymentIntent(
    paymentIntent: Stripe.PaymentIntent,
    source: string,
  ) {
    let session = await this.prisma.checkoutSession.findUnique({
      where: { paymentIntentId: paymentIntent.id },
    });

    if (!session) {
      const checkoutSessionId =
        paymentIntent.metadata?.checkoutSessionId ||
        paymentIntent.metadata?.checkout_session_id;

      if (checkoutSessionId) {
        session = await this.prisma.checkoutSession.findUnique({
          where: { id: checkoutSessionId },
        });

        if (session) {
          session = await this.prisma.checkoutSession.update({
            where: { id: session.id },
            data: { paymentIntentId: paymentIntent.id },
          });
        }
      }

      if (!session) {
        this.logger.warn(
          `No checkout session for payment intent ${paymentIntent.id} (${source})`,
        );
        return null;
      }
    }

    const order = await this.finalizePaidSession(session, paymentIntent, source);
    return {
      sessionId: session.id,
      orderId: order.id,
    };
  }

  private async finalizePaidSession(
    session: CheckoutSession,
    paymentIntent: Stripe.PaymentIntent,
    source: string,
  ) {
    const expectedAmountMinor = this.toStripeMinorAmount(this.toNumber(session.amount));
    const actualAmountMinor = paymentIntent.amount_received || paymentIntent.amount;
    const actualCurrency = (paymentIntent.currency || '').toLowerCase();
    const expectedCurrency = (session.currency || '').toLowerCase();

    if (
      actualAmountMinor !== expectedAmountMinor ||
      actualCurrency !== expectedCurrency
    ) {
      throw new BadRequestException('PaymentIntent amount/currency mismatch');
    }

    if (session.orderId) {
      const existingOrder = await this.prisma.order.findUnique({
        where: { id: session.orderId },
        include: {
          orderItems: {
            include: {
              product: {
                include: { images: true },
              },
            },
          },
        },
      });

      if (existingOrder) {
        return existingOrder;
      }
    }

    const existingOrderByIntent = await this.prisma.order.findFirst({
      where: { stripePaymentIntentId: session.paymentIntentId },
    });

    if (existingOrderByIntent) {
      await this.prisma.checkoutSession.update({
        where: { id: session.id },
        data: {
          orderId: existingOrderByIntent.id,
          status: CheckoutSessionStatus.paid,
          paidAt: new Date(),
        },
      });
      return existingOrderByIntent;
    }

    const snapshot = session.snapshot as unknown as CheckoutSnapshot;
    if (!snapshot?.items?.length) {
      throw new InternalServerErrorException('Invalid checkout session snapshot');
    }
    const paymentCard = await this.resolvePaymentCardSnapshot(paymentIntent);

    const createdOrder = await this.prisma.$transaction(async (tx) => {
      // Pessimistic lock: SELECT FOR UPDATE prevents concurrent stock overwrites
      const productIds = snapshot.items.map((i) => i.productId);
      const lockedProducts = await tx.$queryRaw<
        { id: string; name: string; slug: string; stock: number }[]
      >(Prisma.sql`SELECT id, name, slug, stock FROM products WHERE id IN (${Prisma.join(productIds)}) FOR UPDATE`);

      const productMap = new Map(
        lockedProducts.map((p) => [p.id, p]),
      );

      for (const item of snapshot.items) {
        const product = productMap.get(item.productId);

        if (!product) {
          throw new BadRequestException(`Product ${item.productId} not found`);
        }

        if (product.stock < item.quantity) {
          throw new BadRequestException(`Insufficient stock for ${product.name}`);
        }
      }

      // Get product images for snapshots
      const productImages = await tx.productImage.findMany({
        where: {
          productId: { in: productIds },
          isMain: true,
        },
        select: { productId: true, url: true },
      });
      const imageMap = new Map(
        productImages.map((img) => [img.productId, img.url]),
      );

      const orderNumber = await this.generateOrderNumber(tx);
      const order = await tx.order.create({
        data: {
          userId: session.userId,
          orderNumber,
          totalAmount: new Prisma.Decimal(this.toNumber(session.amount)),
          shippingAmount: new Prisma.Decimal(this.toNumber(session.shippingAmount)),
          taxAmount: new Prisma.Decimal(this.toNumber(session.taxAmount)),
          discountAmount: new Prisma.Decimal(this.toNumber(session.discountAmount)),
          tipAmount: new Prisma.Decimal(this.toNumber(session.tipAmount)),
          couponCode: session.couponCode,
          currency: session.currency.toUpperCase(),
          shippingAddress: snapshot.shippingAddress,
          shippingCity: snapshot.shippingCity,
          shippingCountry: snapshot.shippingCountry,
          shippingPostal: snapshot.shippingPostal,
          shippingNumberOfApartment: snapshot.shippingNumberOfApartment,
          billingAddress: snapshot.billingAddress,
          billingCity: snapshot.billingCity,
          billingCountry: snapshot.billingCountry,
          billingPostal: snapshot.billingPostal,
          paymentMethod: snapshot.paymentMethod,
          paymentCardBrand: paymentCard.brand,
          paymentCardLast4: paymentCard.last4,
          paymentStatus: PaymentStatus.PAID,
          status: 'CONFIRMED',
          stripePaymentIntentId: session.paymentIntentId,
          deliveryDate: snapshot.deliveryDate
            ? new Date(snapshot.deliveryDate)
            : undefined,
          deliveryTime: snapshot.deliveryTime,
          orderItems: {
            create: snapshot.items.map((item) => {
              const product = productMap.get(item.productId);
              return {
                productId: item.productId,
                quantity: item.quantity,
                price: new Prisma.Decimal(item.price),
                total: new Prisma.Decimal(item.total),
                productName: product?.name ?? null,
                productImage: imageMap.get(item.productId) ?? null,
                productSlug: product?.slug ?? null,
              };
            }),
          },
        },
        include: {
          orderItems: {
            include: {
              product: {
                include: { images: true },
              },
            },
          },
        },
      });

      // Decrement stock (already locked by FOR UPDATE)
      for (const item of snapshot.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              decrement: item.quantity,
            },
          },
        });
      }

      // Record initial status transitions
      await tx.orderStatusHistory.createMany({
        data: [
          { orderId: order.id, status: 'PENDING' },
          { orderId: order.id, status: 'CONFIRMED' },
        ],
      });

      await tx.cartItem.deleteMany({
        where: { userId: session.userId },
      });
      await tx.deliverySelection.deleteMany({
        where: { userId: session.userId },
      });

      const previousStatus = session.status;
      await tx.checkoutSession.update({
        where: { id: session.id },
        data: {
          orderId: order.id,
          status: CheckoutSessionStatus.paid,
          paidAt: new Date(),
          lastPaymentError: null,
          lastPaymentAttemptAt: new Date(),
        },
      });

      await tx.checkoutSessionEvent.create({
        data: {
          sessionId: session.id,
          fromStatus: previousStatus,
          toStatus: CheckoutSessionStatus.paid,
          reason: source,
          metadata: {
            orderId: order.id,
            paymentIntentId: session.paymentIntentId,
          } as Prisma.InputJsonValue,
        },
      });

      return order;
    });

    // Send order confirmation email (fire-and-forget, outside transaction)
    this.sendOrderEmail(
      session.userId,
      createdOrder,
      (paymentIntent.currency || session.currency || 'usd').toUpperCase(),
    ).catch((error) => {
      this.logger.error(
        `Failed to send order email for ${createdOrder.orderNumber}: ${(error as Error).message}`,
      );
    });

    return createdOrder;
  }

  private extractCardSnapshotFromPaymentIntent(
    paymentIntent: Stripe.PaymentIntent,
  ): PaymentCardSnapshot {
    const paymentMethod = paymentIntent.payment_method;
    if (paymentMethod && typeof paymentMethod !== 'string') {
      if (paymentMethod.type === 'card') {
        return {
          brand: paymentMethod.card?.brand ?? null,
          last4: paymentMethod.card?.last4 ?? null,
        };
      }
      return { brand: null, last4: null };
    }

    const latestCharge = paymentIntent.latest_charge;
    if (latestCharge && typeof latestCharge !== 'string') {
      if (latestCharge.payment_method_details?.type === 'card') {
        return {
          brand: latestCharge.payment_method_details.card?.brand ?? null,
          last4: latestCharge.payment_method_details.card?.last4 ?? null,
        };
      }
    }

    return { brand: null, last4: null };
  }

  private async resolvePaymentCardSnapshot(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<PaymentCardSnapshot> {
    const directCardSnapshot =
      this.extractCardSnapshotFromPaymentIntent(paymentIntent);
    if (directCardSnapshot.brand || directCardSnapshot.last4) {
      return directCardSnapshot;
    }

    try {
      const expandedPaymentIntent = await this.stripeService.retrievePaymentIntent(
        paymentIntent.id,
        { expand: ['payment_method', 'latest_charge'] },
      );
      return this.extractCardSnapshotFromPaymentIntent(expandedPaymentIntent);
    } catch (error) {
      this.logger.warn(
        `Unable to resolve card details for payment intent ${paymentIntent.id}: ${(error as Error).message}`,
      );
      return { brand: null, last4: null };
    }
  }

  private async sendOrderEmail(
    userId: string,
    order: any,
    currency: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailNotificationsEnabled: true },
    });

    if (!user?.email || user.emailNotificationsEnabled === false) {
      return;
    }

    await this.emailService.sendOrderConfirmation(user.email, {
      orderNumber: order.orderNumber,
      items: order.orderItems.map((item: any) => ({
        name: item.productName || item.product?.name || 'Product',
        quantity: item.quantity,
        price: Number(item.price),
        image: item.productImage || item.product?.images?.[0]?.url,
      })),
      subtotal:
        Number(order.totalAmount) -
        Number(order.shippingAmount) -
        Number(order.taxAmount) -
        Number(order.tipAmount || 0) +
        Number(order.discountAmount),
      shippingAmount: Number(order.shippingAmount),
      taxAmount: Number(order.taxAmount),
      tipAmount: Number(order.tipAmount || 0),
      discountAmount: Number(order.discountAmount),
      total: Number(order.totalAmount),
      currency,
      shippingAddress: order.shippingAddress,
      shippingCity: order.shippingCity,
      shippingCountry: order.shippingCountry,
      shippingPostal: order.shippingPostal,
    });
  }

  private async handlePaymentFailure(
    paymentIntentId: string,
    reason: string,
    errorMessage?: string,
  ) {
    const session = await this.prisma.checkoutSession.findUnique({
      where: { paymentIntentId },
    });

    if (!session || session.status === CheckoutSessionStatus.paid) {
      return;
    }

    await this.transitionSessionStatus(
      session.id,
      CheckoutSessionStatus.payment_failed,
      reason,
      {
        paymentIntentId,
        errorMessage: errorMessage || null,
      },
      {
        lastPaymentError: errorMessage || null,
        lastPaymentAttemptAt: new Date(),
      },
    );
  }

  private async transitionSessionByIntent(
    paymentIntentId: string,
    toStatus: CheckoutSessionStatus,
    reason: string,
  ) {
    const session = await this.prisma.checkoutSession.findUnique({
      where: { paymentIntentId },
    });

    if (!session || session.status === CheckoutSessionStatus.paid) {
      return;
    }

    await this.transitionSessionStatus(session.id, toStatus, reason, {
      paymentIntentId,
    });
  }

  private async transitionSessionStatus(
    sessionId: string,
    toStatus: CheckoutSessionStatus,
    reason: string,
    metadata?: Record<string, unknown>,
    extraUpdate?: Prisma.CheckoutSessionUpdateInput,
  ) {
    const session = await this.prisma.checkoutSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.status === toStatus) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.checkoutSession.update({
        where: { id: sessionId },
        data: {
          status: toStatus,
          ...extraUpdate,
        },
      });

      await tx.checkoutSessionEvent.create({
        data: {
          sessionId,
          fromStatus: session.status,
          toStatus,
          reason,
          metadata: metadata as Prisma.InputJsonValue,
        },
      });
    });
  }

  private async logSessionEvent(params: {
    sessionId: string;
    fromStatus: CheckoutSessionStatus | null;
    toStatus: CheckoutSessionStatus;
    reason: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.prisma.checkoutSessionEvent.create({
      data: {
        sessionId: params.sessionId,
        fromStatus: params.fromStatus,
        toStatus: params.toStatus,
        reason: params.reason,
        metadata: params.metadata as Prisma.InputJsonValue,
      },
    });
  }

  private toPaymentSessionResponse(
    session: CheckoutSession,
    paymentIntent: Stripe.PaymentIntent | null,
    checkoutUrl?: string,
    stripeCheckoutSessionId?: string,
  ) {
    return {
      sessionId: session.id,
      stripePaymentIntentId: session.paymentIntentId,
      stripeClientSecret: paymentIntent?.client_secret ?? '',
      checkoutUrl,
      stripeCheckoutSessionId,
      status: session.status,
      amount: this.toNumber(session.amount),
      tipAmount: this.toNumber(session.tipAmount),
      discountAmount: this.toNumber(session.discountAmount),
      couponCode: session.couponCode,
      currency: session.currency,
      expiresAt: session.expiresAt,
    };
  }

  private attachSessionIdToUrl(url: string | undefined, sessionId: string): string {
    if (!url) {
      throw new BadRequestException(
        'successUrl and cancelUrl are required for Stripe Checkout redirect',
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new BadRequestException('Invalid checkout redirect URL');
    }

    parsedUrl.searchParams.set('sessionId', sessionId);
    return parsedUrl.toString();
  }

  private async getStripeCheckoutCustomerEmail(
    userId: string,
  ): Promise<string | undefined> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    const email = user?.email?.trim().toLowerCase();
    return email || undefined;
  }

  private isPaymentIntentRef(reference: string): boolean {
    return reference.startsWith('pi_');
  }

  private checkoutSessionIdFromRef(reference: string): string | null {
    if (!reference.startsWith('checkout:')) {
      return null;
    }
    return reference.slice('checkout:'.length);
  }

  private async resolveSessionPaymentIntent(
    session: CheckoutSession,
  ): Promise<Stripe.PaymentIntent | null> {
    if (this.isPaymentIntentRef(session.paymentIntentId)) {
      return this.stripeService.retrievePaymentIntent(session.paymentIntentId);
    }

    const checkoutSessionId = this.checkoutSessionIdFromRef(session.paymentIntentId);
    if (!checkoutSessionId) {
      return null;
    }

    const stripeCheckoutSession = await this.stripeService.retrieveCheckoutSession(
      checkoutSessionId,
      { expand: ['payment_intent'] },
    );

    const paymentIntent =
      typeof stripeCheckoutSession.payment_intent === 'string'
        ? await this.stripeService.retrievePaymentIntent(
            stripeCheckoutSession.payment_intent,
          )
        : stripeCheckoutSession.payment_intent;

    if (!paymentIntent) {
      return null;
    }

    if (session.paymentIntentId !== paymentIntent.id) {
      await this.prisma.checkoutSession.update({
        where: { id: session.id },
        data: { paymentIntentId: paymentIntent.id },
      });
      session.paymentIntentId = paymentIntent.id;
    }

    return paymentIntent;
  }

  private async buildReusableCheckoutSessionResponse(
    session: CheckoutSession,
  ): Promise<
    | {
        sessionId: string;
        stripePaymentIntentId: string;
        stripeClientSecret: string;
        checkoutUrl?: string;
        stripeCheckoutSessionId?: string;
        status: CheckoutSessionStatus;
        amount: number;
        currency: string;
        expiresAt: Date;
      }
    | null
  > {
    const checkoutSessionId = this.checkoutSessionIdFromRef(session.paymentIntentId);
    if (!checkoutSessionId) {
      return null;
    }

    try {
      const checkoutSession = await this.stripeService.retrieveCheckoutSession(
        checkoutSessionId,
        { expand: ['payment_intent'] },
      );

      if (checkoutSession.status !== 'open' || !checkoutSession.url) {
        return null;
      }

      const paymentIntent =
        typeof checkoutSession.payment_intent === 'string'
          ? await this.stripeService.retrievePaymentIntent(
              checkoutSession.payment_intent,
            )
          : checkoutSession.payment_intent;

      return this.toPaymentSessionResponse(
        session,
        paymentIntent,
        checkoutSession.url,
        checkoutSession.id,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to reuse checkout session ${checkoutSessionId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private async expireStaleSessions(userId?: string) {
    const now = new Date();
    const sessions = await this.prisma.checkoutSession.findMany({
      where: {
        status: CheckoutSessionStatus.pending_payment,
        expiresAt: {
          lte: now,
        },
        ...(userId ? { userId } : {}),
      },
      take: 100,
      orderBy: {
        expiresAt: 'asc',
      },
    });

    for (const session of sessions) {
      try {
        if (this.isPaymentIntentRef(session.paymentIntentId)) {
          const paymentIntent = await this.stripeService.retrievePaymentIntent(
            session.paymentIntentId,
          );

          if (
            paymentIntent.status !== 'canceled' &&
            paymentIntent.status !== 'succeeded'
          ) {
            await this.stripeService.cancelPaymentIntent(session.paymentIntentId);
          }
        } else {
          const checkoutSessionId = this.checkoutSessionIdFromRef(
            session.paymentIntentId,
          );
          if (checkoutSessionId) {
            await this.stripeService.expireCheckoutSession(checkoutSessionId);
          }
        }
      } catch (error) {
        this.logger.warn(
          `Failed to cancel/expire expired payment session ${session.paymentIntentId}: ${(error as Error).message}`,
        );
      }

      await this.transitionSessionStatus(
        session.id,
        CheckoutSessionStatus.expired,
        'session_expired',
        {
          paymentIntentId: session.paymentIntentId,
        },
      );
    }
  }

  private normalizeCouponCode(couponCode?: string): string | null {
    const normalized = (couponCode || '').trim().toUpperCase();
    return normalized || null;
  }

  private async evaluateCoupon(
    couponCode: string | undefined,
    subtotal: number,
    currency: string,
    strict: boolean,
  ): Promise<CouponEvaluation> {
    const normalizedCode = this.normalizeCouponCode(couponCode);
    if (!normalizedCode) {
      return {
        code: null,
        isValid: true,
        discountAmount: 0,
      };
    }

    if (!this.stripeService.isEnabled()) {
      if (strict) {
        throw new BadRequestException('Stripe coupons are unavailable');
      }
      return {
        code: normalizedCode,
        isValid: false,
        discountAmount: 0,
        message: 'Stripe coupons are unavailable',
      };
    }

    const promotionCode =
      await this.stripeService.findActivePromotionCodeByCode(normalizedCode);
    if (!promotionCode) {
      if (strict) {
        throw new BadRequestException('Coupon code is invalid');
      }
      return {
        code: normalizedCode,
        isValid: false,
        discountAmount: 0,
        message: 'Coupon code is invalid',
      };
    }

    const coupon =
      typeof promotionCode.coupon === 'string'
        ? null
        : promotionCode.coupon;
    if (!coupon) {
      if (strict) {
        throw new BadRequestException('Coupon details are unavailable');
      }
      return {
        code: normalizedCode,
        isValid: false,
        discountAmount: 0,
        message: 'Coupon details are unavailable',
      };
    }

    const minimumAmount =
      promotionCode.restrictions?.minimum_amount !== null &&
      promotionCode.restrictions?.minimum_amount !== undefined
        ? this.fromStripeMinorAmount(promotionCode.restrictions.minimum_amount)
        : null;
    const minimumAmountCurrency =
      promotionCode.restrictions?.minimum_amount_currency?.toLowerCase();
    const normalizedCurrency = (currency || '').toLowerCase();
    if (
      minimumAmount !== null &&
      minimumAmountCurrency &&
      minimumAmountCurrency === normalizedCurrency &&
      subtotal < minimumAmount
    ) {
      const message = `Coupon requires minimum subtotal of ${minimumAmount.toFixed(2)} ${normalizedCurrency.toUpperCase()}`;
      if (strict) {
        throw new BadRequestException(message);
      }
      return {
        code: normalizedCode,
        isValid: false,
        discountAmount: 0,
        message,
      };
    }

    let rawDiscount = 0;
    if (coupon.percent_off) {
      rawDiscount = (subtotal * Number(coupon.percent_off)) / 100;
    } else if (coupon.amount_off) {
      const couponCurrency = (coupon.currency || '').toLowerCase();
      if (couponCurrency && couponCurrency !== normalizedCurrency) {
        const message = `Coupon currency ${couponCurrency.toUpperCase()} does not match checkout currency ${normalizedCurrency.toUpperCase()}`;
        if (strict) {
          throw new BadRequestException(message);
        }
        return {
          code: normalizedCode,
          isValid: false,
          discountAmount: 0,
          message,
        };
      }
      rawDiscount = this.fromStripeMinorAmount(Number(coupon.amount_off));
    }

    const cappedDiscount = Math.min(rawDiscount, subtotal);

    return {
      code: normalizedCode,
      isValid: true,
      discountAmount: this.roundMoney(Math.max(0, cappedDiscount)),
      displayText: coupon.percent_off
        ? `${Number(coupon.percent_off)}% off items`
        : coupon.amount_off
          ? `${this.fromStripeMinorAmount(Number(coupon.amount_off)).toFixed(2)} ${normalizedCurrency.toUpperCase()} off items`
          : undefined,
      promotionCodeId: promotionCode.id,
    };
  }

  private normalizeTipAmount(tipAmount?: number): number {
    const parsed = Number(tipAmount ?? 0);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException('tipAmount must be a non-negative number');
    }
    return this.roundMoney(parsed);
  }

  private async calculateCheckoutPricing(
    subtotal: number,
    shippingAmount: number,
    taxAmount: number,
    currency: string,
    tipAmount: number | undefined,
    couponCode: string | undefined,
    strictCoupon: boolean,
  ): Promise<CheckoutPricing> {
    const normalizedTip = this.normalizeTipAmount(tipAmount);
    const coupon = await this.evaluateCoupon(
      couponCode,
      subtotal,
      currency,
      strictCoupon,
    );
    const discountAmount = coupon.discountAmount;
    const baseTotalAmount = this.roundMoney(
      subtotal + shippingAmount + taxAmount + normalizedTip,
    );
    const totalAmount = this.roundMoney(
      baseTotalAmount - discountAmount,
    );

    if (totalAmount < 0) {
      throw new BadRequestException('Calculated checkout total cannot be negative');
    }

    return {
      subtotal,
      shippingAmount,
      taxAmount,
      tipAmount: normalizedTip,
      discountAmount,
      baseTotalAmount,
      totalAmount,
      coupon,
    };
  }

  private buildCartHash(payload: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private buildStripeLineItems(params: {
    currency: string;
    items: SnapshotItem[];
    shippingAmount: number;
    taxAmount: number;
    tipAmount: number;
    discountAmount: number;
  }): Stripe.Checkout.SessionCreateParams.LineItem[] {
    const productLineItems = params.items.map((item) => ({
      item,
      amountMinor: this.toStripeMinorAmount(item.total),
    }));
    const subtotalMinor = productLineItems.reduce(
      (sum, line) => sum + line.amountMinor,
      0,
    );
    let remainingDiscountMinor = Math.min(
      this.toStripeMinorAmount(params.discountAmount),
      subtotalMinor,
    );
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    for (const line of productLineItems) {
      let adjustedAmountMinor = line.amountMinor;
      if (remainingDiscountMinor > 0 && adjustedAmountMinor > 0) {
        const appliedDiscountMinor = Math.min(
          adjustedAmountMinor,
          remainingDiscountMinor,
        );
        adjustedAmountMinor -= appliedDiscountMinor;
        remainingDiscountMinor -= appliedDiscountMinor;
      }

      lineItems.push({
        quantity: 1,
        price_data: {
          currency: params.currency,
          product_data: {
            name:
              line.item.quantity > 1
                ? `${line.item.productName} x${line.item.quantity}`
                : line.item.productName,
          },
          unit_amount: adjustedAmountMinor,
        },
      });
    }

    const extraLines: Array<{ name: string; amount: number }> = [
      { name: 'Shipping', amount: params.shippingAmount },
      { name: 'Tax', amount: params.taxAmount },
      { name: 'Tip', amount: params.tipAmount },
    ];

    for (const extra of extraLines) {
      const amountMinor = this.toStripeMinorAmount(extra.amount);
      if (amountMinor <= 0) {
        continue;
      }

      lineItems.push({
        quantity: 1,
        price_data: {
          currency: params.currency,
          product_data: {
            name: extra.name,
          },
          unit_amount: amountMinor,
        },
      });
    }

    if (!lineItems.length) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: params.currency,
          product_data: {
            name: 'Order payment',
          },
          unit_amount: this.toStripeMinorAmount(
            Math.max(
              0,
              params.items.reduce((sum, item) => sum + item.total, 0) +
                params.shippingAmount +
                params.taxAmount +
                params.tipAmount,
            ),
          ),
        },
      });
    }

    return lineItems;
  }

  private normalizeCurrency(currency?: string) {
    return (currency || 'usd').trim().toLowerCase();
  }

  private normalizeStripeCheckoutLocale(
    locale?: string,
  ): Stripe.Checkout.SessionCreateParams.Locale {
    const resolvedLocale = locale || 'en';
    if (resolvedLocale === 'de') {
      return 'de';
    }

    if (resolvedLocale === 'en') {
      return 'en';
    }

    // Stripe doesn't have direct "uk" locale for Checkout UI.
    return 'auto';
  }

  private toNumber(value: number | Prisma.Decimal | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }

    if (value instanceof Prisma.Decimal) {
      return value.toNumber();
    }

    return Number(value);
  }

  private roundMoney(amount: number) {
    return Math.round((amount + Number.EPSILON) * 100) / 100;
  }

  private toStripeMinorAmount(amount: number): number {
    if (amount < 0) {
      throw new BadRequestException('Amount cannot be negative');
    }

    return Math.round(amount * 100);
  }

  private fromStripeMinorAmount(amountInMinor: number): number {
    return amountInMinor / 100;
  }

  private getSessionTtlMinutes() {
    const value = Number(process.env.CHECKOUT_SESSION_TTL_MINUTES || 30);
    return Number.isFinite(value) && value > 0 ? value : 30;
  }

  private getCleanupIntervalMs() {
    const value = Number(process.env.CHECKOUT_SESSION_CLEANUP_MS || 300000);
    return Number.isFinite(value) && value >= 60000 ? value : 300000;
  }

  private async generateOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const prefix = `ORD${year}${month}${day}`;

    const latestOrder = await tx.order.findFirst({
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
      const lastSequence = parseInt(latestOrder.orderNumber.slice(-4), 10);
      sequence = lastSequence + 1;
    }

    return `${prefix}${sequence.toString().padStart(4, '0')}`;
  }
}
