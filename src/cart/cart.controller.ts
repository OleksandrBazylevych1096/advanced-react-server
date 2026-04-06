import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUserId } from '../decorators/get-user-id.decorator';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  private resolveCurrency(currency?: string) {
    return currency || 'USD';
  }

  @Post('add')
  addToCart(
    @GetUserId() userId: string,
    @Body() addToCartDto: AddToCartDto,
    @Query('locale') locale?: string,
    @Query('currency') currency?: string,
  ) {
    return this.cartService.addToCart(
      userId,
      addToCartDto,
      locale || 'en',
      this.resolveCurrency(currency),
    );
  }

  @Get()
  getCart(
    @GetUserId() userId: string,
    @Query('locale') locale?: string,
    @Query('currency') currency?: string,
  ) {
    return this.cartService.getCart(
      userId,
      locale || 'en',
      this.resolveCurrency(currency),
    );
  }

  @Get('count')
  getCartItemsCount(@GetUserId() userId: string) {
    return this.cartService.getCartItemsCount(userId);
  }

  @Get('validate')
  validateCartItems(
    @GetUserId() userId: string,
    @Query('locale') locale?: string,
  ) {
    return this.cartService.validateCartItems(userId, locale || 'en');
  }

  @Patch('item/:productId')
  updateCartItem(
    @GetUserId() userId: string,
    @Param('productId') productId: string,
    @Body() updateCartItemDto: UpdateCartItemDto,
  ) {
    return this.cartService.updateCartItem(
      userId,
      productId,
      updateCartItemDto,
    );
  }

  @Delete('item/:productId')
  removeFromCart(
    @GetUserId() userId: string,
    @Param('productId') productId: string,
  ) {
    return this.cartService.removeFromCart(userId, productId);
  }

  @Delete('clear')
  clearCart(@GetUserId() userId: string) {
    return this.cartService.clearCart(userId);
  }

  @Post('sync')
  syncCart(
    @GetUserId() userId: string,
    @Body('guestCartItems') guestCartItems: any[],
    @Query('locale') locale?: string,
    @Query('currency') currency?: string,
  ) {
    return this.cartService.syncCartAfterLogin(
      guestCartItems,
      userId,
      locale || 'en',
      this.resolveCurrency(currency),
    );
  }
}
