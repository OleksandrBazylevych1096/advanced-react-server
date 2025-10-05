import { Module } from '@nestjs/common';
import { PromoBannerService } from './promo-banner.service';
import { PromoBannerController } from './promo-banner.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PromoBannerController],
  providers: [PromoBannerService],
})
export class PromoBannerModule {}
