import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { CheckoutService } from './checkout.service';

@Controller('stripe')
export class StripeWebhookController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('webhook')
  @HttpCode(200)
  async handleStripeWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing Stripe-Signature header');
    }

    if (!req.rawBody) {
      throw new BadRequestException('Missing raw request body for webhook');
    }

    return this.checkoutService.processStripeWebhook(req.rawBody, signature);
  }
}
