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
import { TagService } from './tag.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { TagQueryDto } from './dto/tag-query.dto';
import { AssignTagsDto, CreateTagsDto } from './dto/assign-tags.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('tags')
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() createTagDto: CreateTagDto) {
    return this.tagService.create(createTagDto);
  }

  @Post('bulk')
  @UseGuards(JwtAuthGuard)
  createMultiple(@Body() createTagsDto: CreateTagsDto) {
    return this.tagService.createMultipleTags(createTagsDto);
  }

  @Get()
  findAll(@Query() query: TagQueryDto) {
    return this.tagService.findAll(query);
  }

  @Get('popular')
  getPopularTags(
    @Query('limit') limit?: string,
    @Query('locale') locale?: string,
  ) {
    const limitNumber = limit ? parseInt(limit) : 10;
    return this.tagService.getPopularTags(limitNumber, locale);
  }

  @Get('search')
  searchTags(@Query('q') search: string) {
    return this.tagService.searchTags(search);
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.tagService.findBySlug(slug);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tagService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @Body() updateTagDto: UpdateTagDto) {
    return this.tagService.update(id, updateTagDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string) {
    return this.tagService.remove(id);
  }

  @Delete('products/:productId/tags/:tagId')
  @UseGuards(JwtAuthGuard)
  removeTagFromProduct(
    @Param('productId') productId: string,
    @Param('tagId') tagId: string,
  ) {
    return this.tagService.removeTagFromProduct(productId, tagId);
  }

  @Get('products/:productId')
  getProductTags(@Param('productId') productId: string) {
    return this.tagService.getProductTags(productId);
  }
}
