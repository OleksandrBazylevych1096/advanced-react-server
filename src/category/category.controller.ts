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
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryI18nDto } from './dto/create-category-i18n.dto';
import { UpdateCategoryI18nDto } from './dto/update-category-i18n.dto';
import { CategoryQueryDto } from './dto/category-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() createCategoryDto: CreateCategoryI18nDto) {
    return this.categoryService.create(createCategoryDto);
  }

  @Get()
  findAll(@Query() query: CategoryQueryDto) {
    const includeInactiveBool =
      typeof query.includeInactive === 'string'
        ? query.includeInactive === 'true'
        : false;
    return this.categoryService.findAll(includeInactiveBool, query.locale);
  }

  @Get('top-level')
  getTopLevelCategories(@Query('locale') locale?: string) {
    return this.categoryService.getTopLevelCategories(locale);
  }

  @Get('tree')
  getCategoryTree(@Query('locale') locale?: string) {
    return this.categoryService.getCategoryTree(locale);
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string, @Query('locale') locale?: string) {
    return this.categoryService.findBySlug(slug, locale);
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
  ) {
    return this.categoryService.findChildrenBySlug(slug, locale);
  }

  @Get('breadcrumbs/:value')
  async getBreadcrumbs(
    @Param('value') value: string,
    @Query('locale') locale: string = 'en',
  ) {
    const looksLikeId = /^[a-z0-9]{12,}$/i.test(value);
    if (looksLikeId) {
      try {
        const category = await this.categoryService.findOne(value, locale);
        return this.categoryService.getBreadcrumbsBySlug(category.slug, locale);
      } catch {
        // Fallback to slug lookup.
      }
    }
    return this.categoryService.getBreadcrumbsBySlug(value, locale);
  }

  @Get('navigation/:slug')
  async getCategoryNavigation(
    @Param('slug') slug: string | undefined,
    @Query('search') search: string | undefined,
    @Query('locale') locale: string = 'en',
  ) {
    return this.categoryService.getCategoryNavigation(
      slug === 'undefined' ? undefined : slug,
      locale,
      search,
    );
  }

  @Get('navigation')
  async getCategoryNavigationByQuery(
    @Query('slug') slug: string | undefined,
    @Query('search') search: string | undefined,
    @Query('locale') locale: string = 'en',
  ) {
    return this.categoryService.getCategoryNavigation(
      slug === 'undefined' ? undefined : slug,
      locale,
      search,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Query('locale') locale?: string) {
    return this.categoryService.findOne(id, locale);
  }
}
