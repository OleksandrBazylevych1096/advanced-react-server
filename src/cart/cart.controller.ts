import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUserId } from '../auth/decorators/get-user-id.decorator';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post('add')
  addToCart(@GetUserId() userId: string, @Body() addToCartDto: AddToCartDto) {
    return this.cartService.addToCart(userId, addToCartDto);
  }

  @Get()
  getCart(@GetUserId() userId: string) {
    return this.cartService.getCart(userId);
  }

  @Get('count')
  getCartItemsCount(@GetUserId() userId: string) {
    return this.cartService.getCartItemsCount(userId);
  }

  @Get('validate')
  validateCartItems(@GetUserId() userId: string) {
    return this.cartService.validateCartItems(userId);
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
  ) {
    return this.cartService.syncCartAfterLogin(guestCartItems, userId);
  }
}
