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
import { CategoryService } from './category.service';
import { CreateCategoryI18nDto } from './dto/create-category-i18n.dto';
import { UpdateCategoryI18nDto } from './dto/update-category-i18n.dto';
import { CategoryQueryDto } from './dto/category-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  private getLocale(query: { locale?: string }, headers?: any): string {
    return (
      query.locale ||
      headers?.['accept-language']?.split(',')[0]?.split('-')[0] ||
      'en'
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() createCategoryDto: CreateCategoryI18nDto) {
    return this.categoryService.create(createCategoryDto);
  }

  @Get()
  findAll(@Query() query: CategoryQueryDto, @Headers() headers?: any) {
    const includeInactiveBool =
      typeof query.includeInactive === 'string'
        ? query.includeInactive === 'true'
        : false;
    return this.categoryService.findAll(
      includeInactiveBool,
      this.getLocale(query, headers),
    );
  }

  @Get('top-level')
  getTopLevelCategories(
    @Query('locale') locale?: string,
    @Headers() headers?: any,
  ) {
    return this.categoryService.getTopLevelCategories(
      this.getLocale({ locale }, headers),
    );
  }

  @Get('tree')
  getCategoryTree(@Query('locale') locale?: string, @Headers() headers?: any) {
    return this.categoryService.getCategoryTree(
      this.getLocale({ locale }, headers),
    );
  }

  @Get('slug/:slug')
  findBySlug(
    @Param('slug') slug: string,
    @Query('locale') locale?: string,
    @Headers() headers?: any,
  ) {
    return this.categoryService.findBySlug(
      slug,
      this.getLocale({ locale }, headers),
    );
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryI18nDto,
  ) {
    return this.categoryService.update(id, updateCategoryDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string) {
    return this.categoryService.remove(id);
  }

  @Get(':slug/children')
  findChildrenBySlug(
    @Param('slug') slug: string,
    @Query('locale') locale?: string,
    @Headers() headers?: any,
  ) {
    return this.categoryService.findChildrenBySlug(
      slug,
      this.getLocale({ locale }, headers),
    );
  }

  @Get('breadcrumbs/:value')
  async getBreadcrumbs(
    @Param('value') value: string,
    @Query('locale') locale: string = 'en',
    @Headers() headers?: any,
  ) {
    const resolvedLocale = this.getLocale({ locale }, headers);
    const looksLikeId = /^[a-z0-9]{12,}$/i.test(value);
    if (looksLikeId) {
      try {
        const category = await this.categoryService.findOne(value, resolvedLocale);
        return this.categoryService.getBreadcrumbsBySlug(
          category.slug,
          resolvedLocale,
        );
      } catch {
      }
    }
    return this.categoryService.getBreadcrumbsBySlug(value, resolvedLocale);
  }

  @Get('navigation/:slug')
  async getCategoryNavigation(
    @Param('slug') slug: string | undefined,
    @Query('search') search: string | undefined,
    @Query('locale') locale: string = 'en',
    @Headers() headers?: any,
  ) {
    const resolvedLocale = this.getLocale({ locale }, headers);
    return this.categoryService.getCategoryNavigation(
      slug === 'undefined' ? undefined : slug,
      resolvedLocale,
      search,
    );
  }

  @Get('navigation')
  async getCategoryNavigationByQuery(
    @Query('slug') slug: string | undefined,
    @Query('search') search: string | undefined,
    @Query('locale') locale: string = 'en',
    @Headers() headers?: any,
  ) {
    const resolvedLocale = this.getLocale({ locale }, headers);
    return this.categoryService.getCategoryNavigation(
      slug === 'undefined' ? undefined : slug,
      resolvedLocale,
      search,
    );
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Query('locale') locale?: string,
    @Headers() headers?: any,
  ) {
    return this.categoryService.findOne(id, this.getLocale({ locale }, headers));
  }
}
