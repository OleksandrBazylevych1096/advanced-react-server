import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUserId } from '../decorators/get-user-id.decorator';

@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@GetUserId() userId: string, @Body() createOrderDto: CreateOrderDto) {
    return this.orderService.create(userId, createOrderDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Query() query: OrderQueryDto) {
    // This endpoint can be used by admins to see all orders
    return this.orderService.findAll(query, undefined, query.locale || 'en');
  }

  @Get('my-orders')
  @UseGuards(JwtAuthGuard)
  getUserOrders(@GetUserId() userId: string, @Query() query: OrderQueryDto) {
    return this.orderService.getUserOrders(userId, query, query.locale || 'en');
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  getOrderStats(@GetUserId() userId?: string) {
    // For regular users, pass userId to get their stats only
    // For admins, don't pass userId to get all stats
    return this.orderService.getOrderStats(userId);
  }

  @Get('my-stats')
  @UseGuards(JwtAuthGuard)
  getUserOrderStats(@GetUserId() userId: string) {
    return this.orderService.getOrderStats(userId);
  }

  @Get('number/:orderNumber')
  @UseGuards(JwtAuthGuard)
  findByOrderNumber(
    @Param('orderNumber') orderNumber: string,
    @GetUserId() userId: string,
    @Query('locale') locale?: string,
  ) {
    return this.orderService.findByOrderNumber(orderNumber, userId, locale || 'en');
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(
    @Param('id') id: string,
    @GetUserId() userId: string,
    @Query('locale') locale?: string,
  ) {
    return this.orderService.findOne(id, userId, locale || 'en');
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  cancel(
    @Param('id') id: string,
    @GetUserId() userId: string,
    @Query('locale') locale?: string,
  ) {
    return this.orderService.cancelOrder(id, userId, locale || 'en');
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @Body() updateOrderDto: UpdateOrderDto) {
    // This endpoint should typically be restricted to admins
    return this.orderService.update(id, updateOrderDto);
  }
}
