import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ExchangeRateModule } from '../exchange-rate/exchange-rate.module';
import { SearchHistoryService } from './search-history.service';

@Module({
  imports: [PrismaModule, ExchangeRateModule],
  controllers: [ProductController],
  providers: [ProductService, SearchHistoryService],
  exports: [ProductService],
})
export class ProductModule {}
