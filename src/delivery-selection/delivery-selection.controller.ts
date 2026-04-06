import {
  Controller,
  Delete,
  Get,
  Patch,
  Body,
  Query,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUserId } from '../decorators/get-user-id.decorator';
import { DeliverySelectionService } from './delivery-selection.service';
import { DeliverySlotsQueryDto } from './dto/delivery-slots-query.dto';
import { SetDeliverySelectionDto } from './dto/set-delivery-selection.dto';

@Controller('delivery-selection')
@UseGuards(JwtAuthGuard)
export class DeliverySelectionController {
  constructor(private readonly deliverySelectionService: DeliverySelectionService) {}

  private getLocale(queryLocale?: string, headerLanguage?: string) {
    return queryLocale || headerLanguage?.split(',')[0]?.split('-')[0] || 'en';
  }

  @Get('slots')
  getDeliverySlots(
    @GetUserId() userId: string,
    @Query() query: DeliverySlotsQueryDto,
    @Headers('accept-language') headerLanguage?: string,
  ) {
    const locale = this.getLocale(query.locale, headerLanguage);
    return this.deliverySelectionService.getDeliverySlots(userId, {
      ...query,
      locale,
    });
  }

  @Get()
  getSelection(
    @GetUserId() userId: string,
    @Query('locale') locale?: string,
    @Headers('accept-language') headerLanguage?: string,
  ) {
    const resolvedLocale = this.getLocale(locale, headerLanguage);
    return this.deliverySelectionService.getStoredSelection(userId, resolvedLocale);
  }

  @Patch()
  setSelection(@GetUserId() userId: string, @Body() dto: SetDeliverySelectionDto) {
    return this.deliverySelectionService.setSelection(userId, dto);
  }

  @Delete()
  clearSelection(@GetUserId() userId: string) {
    return this.deliverySelectionService.clearSelection(userId);
  }
}
