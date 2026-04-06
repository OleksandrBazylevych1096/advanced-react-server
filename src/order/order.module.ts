import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CartModule } from '../cart/cart.module';
import { StripeService } from './stripe.service';

@Module({
  imports: [PrismaModule, CartModule],
  controllers: [OrderController],
  providers: [OrderService, StripeService],
  exports: [OrderService, StripeService],
})
export class OrderModule {}
