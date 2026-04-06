import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { DeliverySelectionModule } from '../delivery-selection/delivery-selection.module';
import { EmailModule } from '../email/email.module';
import { OrderModule } from '../order/order.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
  imports: [CartModule, DeliverySelectionModule, EmailModule, OrderModule],
  controllers: [CheckoutController, StripeWebhookController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
