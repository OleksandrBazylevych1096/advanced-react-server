import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ShippingAddressModule } from '../shipping-address/shipping-address.module';
import { DeliverySelectionController } from './delivery-selection.controller';
import { DeliverySelectionService } from './delivery-selection.service';
import { ExchangeRateModule } from '../exchange-rate/exchange-rate.module';

@Module({
  imports: [PrismaModule, ShippingAddressModule, ExchangeRateModule],
  controllers: [DeliverySelectionController],
  providers: [DeliverySelectionService],
  exports: [DeliverySelectionService],
})
export class DeliverySelectionModule {}
