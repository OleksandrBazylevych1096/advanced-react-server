import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ProductService } from './product.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateProductI18nDto } from './dto/create-product-i18n.dto';
import { ProductQueryI18nDto } from './dto/product-query-i18n.dto';
import { UpdateProductI18nDto } from './dto/update-product-i18n.dto';
import { GetUserId } from 'src/decorators/get-user-id.decorator';
import { SearchHistoryService } from './search-history.service';
import { SyncSearchHistoryDto } from './dto/sync-search-history.dto';

@Controller('products')
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly searchHistoryService: SearchHistoryService,
  ) {}

  private getLocale(query: any, headers: any): string {
    return (
      query.locale ||
      headers['accept-language']?.split(',')[0]?.split('-')[0] ||
      'en'
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() createProductDto: CreateProductI18nDto) {
    return this.productService.create(createProductDto);
  }

  @Get()
  findAll(@Query() query: ProductQueryI18nDto, @Headers() headers: any) {
    const locale = this.getLocale(query, headers);
    return this.productService.findAll({ ...query, locale });
  }

  @Get('featured')
  getFeatured(
    @Query('limit') limit?: string,
    @Query('locale') locale?: string,
    @Query('currency') currency?: string,
    @Headers() headers?: any,
  ) {
    const limitNumber = limit ? parseInt(limit) : 10;
    const resolvedLocale = this.getLocale({ locale }, headers);
    return this.productService.getFeatured(
      limitNumber,
      resolvedLocale,
      currency,
    );
  }

  @Get('best-sellers')
  getBestSellers(
    @Query('limit') limit?: string,
    @Query('locale') locale?: string,
    @Query('currency') currency?: string,
    @Headers() headers?: any,
  ) {
    const limitNumber = limit ? parseInt(limit) : 20;
    const resolvedLocale = this.getLocale({ locale }, headers);
    return this.productService.getBestSellers(
      limitNumber,
      resolvedLocale,
      currency,
    );
  }

  @Get('first-order-discount')
  getFirstOrderDiscount(
    @Query('locale') locale?: string,
    @Query('currency') currency?: string,
    @Headers() headers?: any,
  ) {
    const resolvedLocale = this.getLocale({ locale }, headers);
    return this.productService.getFirstOrderDiscount(resolvedLocale, currency);
  }

  @Get('slug/:slug')
  findBySlug(
    @Param('slug') slug: string,
    @Query('locale') locale?: string,
    @Query('currency') currency?: string,
    @Headers() headers?: any,
  ) {
    const resolvedLocale = this.getLocale({ locale }, headers);
    return this.productService.findBySlug(slug, resolvedLocale, currency);
  }

  @Get('search-history')
  @UseGuards(JwtAuthGuard)
  async getSearchHistory(@GetUserId() userId: string) {
    const items = await this.searchHistoryService.getUserHistory(userId);
    return items.map((item) => ({
      id: item.id,
      query: item.query,
      createdAt:
        item.updatedAt instanceof Date
          ? item.updatedAt.toISOString()
          : item.updatedAt,
    }));
  }

  @Get('search-history/popular')
  getPopularSearchHistory() {
    return this.searchHistoryService.getPopularQueries();
  }

  @Post('search-history/sync')
  @UseGuards(JwtAuthGuard)
  syncSearchHistory(
    @GetUserId() userId: string,
    @Body() dto: SyncSearchHistoryDto,
  ) {
    return this.searchHistoryService.syncUserHistory(userId, dto.queries).then((data) => ({
      mergedCount: data.syncedCount,
      items: data.items.map((item) => ({
        id: item.id,
        query: item.query,
        createdAt:
          item.updatedAt instanceof Date
            ? item.updatedAt.toISOString()
            : item.updatedAt,
      })),
    }));
  }

  @Delete('search-history/:id')
  @UseGuards(JwtAuthGuard)
  deleteSearchHistoryItem(@GetUserId() userId: string, @Param('id') id: string) {
    return this.searchHistoryService.deleteHistoryItem(userId, id);
  }

  @Delete('search-history')
  @UseGuards(JwtAuthGuard)
  clearSearchHistory(@GetUserId() userId: string) {
    return this.searchHistoryService.clearUserHistory(userId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Query('locale') locale?: string,
    @Query('currency') currency?: string,
    @Headers() headers?: any,
  ) {
    const resolvedLocale = this.getLocale({ locale }, headers);
    return this.productService.findOne(id, resolvedLocale, currency);
  }

  @Get(':id/related')
  getRelatedProducts(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('locale') locale?: string,
    @Query('currency') currency?: string,
    @Headers() headers?: any,
  ) {
    const limitNumber = limit ? parseInt(limit) : 4;
    const resolvedLocale = this.getLocale({ locale }, headers);
    return this.productService.getRelatedProducts(
      id,
      limitNumber,
      resolvedLocale,
      currency,
    );
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductI18nDto,
  ) {
    return this.productService.update(id, updateProductDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string) {
    return this.productService.remove(id);
  }

  // Додаткові ендпоінти для роботи з переkладами
  @Get(':id/translations')
  async getProductTranslations(@Param('id') id: string) {
    // Отримуємо всі переклади продукту
    const product = await this.productService.findOne(id);
    return product.translations;
  }
}
