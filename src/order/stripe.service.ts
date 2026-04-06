import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string | null;

  constructor(private readonly configService: ConfigService) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.webhookSecret =
      this.configService.get<string>('STRIPE_WEBHOOK_SECRET') || null;

    this.stripe = stripeSecretKey
      ? new Stripe(stripeSecretKey, { apiVersion: '2025-08-27.basil' })
      : null;
  }

  isEnabled(): boolean {
    return this.stripe !== null;
  }

  async createPaymentIntent(params: {
    amountInMinor: number;
    currency: string;
    metadata: Stripe.MetadataParam;
    idempotencyKey?: string;
  }) {
    if (!this.stripe) {
      throw new InternalServerErrorException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY.',
      );
    }

    return this.stripe.paymentIntents.create(
      {
        amount: params.amountInMinor,
        currency: params.currency,
        automatic_payment_methods: { enabled: true },
        metadata: params.metadata,
      },
      params.idempotencyKey
        ? {
            idempotencyKey: params.idempotencyKey,
          }
        : undefined,
    );
  }

  async createCheckoutSession(params: {
    amountInMinor: number;
    lineItems?: Stripe.Checkout.SessionCreateParams.LineItem[];
    currency: string;
    locale?: Stripe.Checkout.SessionCreateParams.Locale;
    successUrl: string;
    cancelUrl: string;
    metadata: Stripe.MetadataParam;
    customerEmail?: string;
    orderLabel?: string;
    promotionCodeId?: string;
  }) {
    if (!this.stripe) {
      throw new InternalServerErrorException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY.',
      );
    }

    return this.stripe.checkout.sessions.create({
      mode: 'payment',
      locale: params.locale,
      adaptive_pricing: {
        enabled: false,
      },

      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      customer_email: params.customerEmail,
      expand: ['payment_intent'],
      metadata: params.metadata,
      payment_intent_data: {
        metadata: params.metadata,
        description: params.orderLabel
          ? `Order ID: ${params.orderLabel}`
          : undefined,
      },
      discounts: params.promotionCodeId
        ? [{ promotion_code: params.promotionCodeId }]
        : undefined,
      line_items:
        params.lineItems && params.lineItems.length > 0
          ? params.lineItems
          : [
              {
                quantity: 1,
                price_data: {
                  currency: params.currency,
                  product_data: {
                    name: 'Order payment',
                    description: params.orderLabel
                      ? `Order ID: ${params.orderLabel}`
                      : undefined,
                  },
                  unit_amount: params.amountInMinor,
                },
              },
            ],
    });
  }

  async findActivePromotionCodeByCode(
    code: string,
  ): Promise<Stripe.PromotionCode | null> {
    if (!this.stripe) {
      throw new InternalServerErrorException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY.',
      );
    }

    const normalizedCode = (code || '').trim();
    if (!normalizedCode) {
      return null;
    }

    const response = await this.stripe.promotionCodes.list({
      code: normalizedCode,
      active: true,
      limit: 1,
      expand: ['data.coupon'],
    });

    return response.data[0] ?? null;
  }

  async retrievePaymentIntent(
    paymentIntentId: string,
    params?: Stripe.PaymentIntentRetrieveParams,
  ) {
    if (!this.stripe) {
      throw new InternalServerErrorException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY.',
      );
    }

    return this.stripe.paymentIntents.retrieve(paymentIntentId, params);
  }

  async retrieveCheckoutSession(
    checkoutSessionId: string,
    params?: Stripe.Checkout.SessionRetrieveParams,
  ) {
    if (!this.stripe) {
      throw new InternalServerErrorException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY.',
      );
    }

    return this.stripe.checkout.sessions.retrieve(checkoutSessionId, params);
  }

  async expireCheckoutSession(checkoutSessionId: string) {
    if (!this.stripe) {
      throw new InternalServerErrorException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY.',
      );
    }

    return this.stripe.checkout.sessions.expire(checkoutSessionId);
  }

  async cancelPaymentIntent(paymentIntentId: string) {
    if (!this.stripe) {
      throw new InternalServerErrorException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY.',
      );
    }

    return this.stripe.paymentIntents.cancel(paymentIntentId);
  }

  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    if (!this.stripe) {
      throw new InternalServerErrorException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY.',
      );
    }

    if (!this.webhookSecret) {
      throw new InternalServerErrorException(
        'Stripe webhook is not configured. Set STRIPE_WEBHOOK_SECRET.',
      );
    }

    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret,
    );
  }

  async refundPaymentIntent(paymentIntentId: string) {
    if (!this.stripe) {
      throw new InternalServerErrorException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY.',
      );
    }

    return this.stripe.refunds.create({
      payment_intent: paymentIntentId,
    });
  }

  async createCatalogProduct(params: {
    name: string;
    description?: string;
    images?: string[];
    metadata?: Stripe.MetadataParam;
  }) {
    if (!this.stripe) {
      throw new InternalServerErrorException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY.',
      );
    }

    return this.stripe.products.create({
      name: params.name,
      description: params.description,
      images: params.images,
      metadata: params.metadata,
    });
  }

  async createCatalogPrice(params: {
    productId: string;
    currency: string;
    unitAmountMinor: number;
    metadata?: Stripe.MetadataParam;
  }) {
    if (!this.stripe) {
      throw new InternalServerErrorException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY.',
      );
    }

    return this.stripe.prices.create({
      product: params.productId,
      currency: params.currency,
      unit_amount: params.unitAmountMinor,
      metadata: params.metadata,
    });
  }
}
