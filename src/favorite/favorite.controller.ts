import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
} from '@nestjs/common';
import { FavoriteService } from './favorite.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUserId } from '../auth/decorators/get-user-id.decorator';

@Controller('favorites')
@UseGuards(JwtAuthGuard)
export class FavoriteController {
  constructor(private readonly favoriteService: FavoriteService) {}

  @Post(':productId')
  addToFavorites(
    @GetUserId() userId: string,
    @Param('productId') productId: string,
  ) {
    return this.favoriteService.addToFavorites(userId, productId);
  }

  @Get()
  getUserFavorites(@GetUserId() userId: string) {
    return this.favoriteService.getUserFavorites(userId);
  }

  @Get('count')
  getFavoritesCount(@GetUserId() userId: string) {
    return this.favoriteService.getFavoritesCount(userId);
  }

  @Get('check/:productId')
  isFavorite(
    @GetUserId() userId: string,
    @Param('productId') productId: string,
  ) {
    return this.favoriteService.isFavorite(userId, productId);
  }

  @Post('toggle/:productId')
  toggleFavorite(
    @GetUserId() userId: string,
    @Param('productId') productId: string,
  ) {
    return this.favoriteService.toggleFavorite(userId, productId);
  }

  @Delete(':productId')
  removeFromFavorites(
    @GetUserId() userId: string,
    @Param('productId') productId: string,
  ) {
    return this.favoriteService.removeFromFavorites(userId, productId);
  }
}
