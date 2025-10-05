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
import { PromoBannerService } from './promo-banner.service';
import { CreatePromoBannerDto } from './dto/create-promo-banner.dto';
import { UpdatePromoBannerDto } from './dto/update-promo-banner.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('promo-banners')
export class PromoBannerController {
  constructor(private readonly promoBannerService: PromoBannerService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() createPromoBannerDto: CreatePromoBannerDto) {
    return this.promoBannerService.create(createPromoBannerDto);
  }

  @Get()
  findAll() {
    return this.promoBannerService.findAll();
  }

  @Get('active')
  findActive() {
    return this.promoBannerService.findActive();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.promoBannerService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Body() updatePromoBannerDto: UpdatePromoBannerDto,
  ) {
    return this.promoBannerService.update(id, updatePromoBannerDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string) {
    return this.promoBannerService.remove(id);
  }
}
