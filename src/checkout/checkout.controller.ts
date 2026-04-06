import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUserId } from '../decorators/get-user-id.decorator';
import { CheckoutService } from './checkout.service';
import { CreatePaymentSessionDto } from './dto/create-payment-session.dto';

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Get('summary')
  @UseGuards(JwtAuthGuard)
  getSummary(
    @GetUserId() userId: string,
    @Query('locale') locale?: string,
    @Query('currency') currency?: string,
    @Query('couponCode') couponCode?: string,
    @Query('tipAmount') tipAmount?: string,
  ) {
    const parsedTipAmount =
      tipAmount === undefined ? undefined : Number(tipAmount);

    return this.checkoutService.getSummary(
      userId,
      locale || 'en',
      currency,
      couponCode,
      Number.isFinite(parsedTipAmount) ? parsedTipAmount : undefined,
    );
  }

  @Post('payment-session')
  @UseGuards(JwtAuthGuard)
  createPaymentSession(
    @GetUserId() userId: string,
    @Body() dto: CreatePaymentSessionDto,
  ) {
    return this.checkoutService.createPaymentSession(userId, dto);
  }

  @Get('validate-coupon')
  @UseGuards(JwtAuthGuard)
  validateCoupon(
    @GetUserId() userId: string,
    @Query('locale') locale?: string,
    @Query('currency') currency?: string,
    @Query('couponCode') couponCode?: string,
  ) {
    return this.checkoutService.validateCoupon(
      userId,
      locale || 'en',
      currency,
      couponCode,
    );
  }

  @Post('place-order')
  @UseGuards(JwtAuthGuard)
  placeOrder(
    @GetUserId() userId: string,
    @Body() dto: CreatePaymentSessionDto,
  ) {
    return this.checkoutService.createPaymentSession(userId, dto);
  }

  @Get('payment-session/:sessionId')
  @UseGuards(JwtAuthGuard)
  getPaymentSession(
    @GetUserId() userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.checkoutService.getPaymentSession(userId, sessionId);
  }

  @Patch(':sessionId/confirm-payment')
  @UseGuards(JwtAuthGuard)
  confirmPayment(
    @GetUserId() userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.checkoutService.confirmPayment(userId, sessionId);
  }
}
