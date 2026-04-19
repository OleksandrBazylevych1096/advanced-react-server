import { Module } from '@nestjs/common';
import { ShippingAddressService } from './shipping-address.service';
import { ShippingAddressController } from './shipping-address.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NominatimModule } from 'src/nominatim/nominatim.module';
import { CountryModule } from '../country/country.module';

@Module({
  imports: [PrismaModule, NominatimModule, CountryModule],
  controllers: [ShippingAddressController],
  providers: [ShippingAddressService],
  exports: [ShippingAddressService],
})
export class ShippingAddressModule {}
