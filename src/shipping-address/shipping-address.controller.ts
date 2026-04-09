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
  Headers,
} from '@nestjs/common';
import { ShippingAddressService } from './shipping-address.service';
import { NominatimService } from '../nominatim/nominatim.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { SearchAddressDto } from './dto/search-address.dto';
import { ReverseGeocodeDto } from './dto/reverse-geocode.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUserId } from 'src/decorators/get-user-id.decorator';

@Controller('shipping-addresses')
export class ShippingAddressController {
  constructor(
    private readonly service: ShippingAddressService,
    private readonly nominatimService: NominatimService,
  ) {}

  // ========== Nominatim endpoints ==========
  @Get('search')
  async searchAddresses(
    @Query() dto: SearchAddressDto,
    @Headers('accept-language') headerLanguage?: string,
  ) {
    const language = dto.locale || headerLanguage || 'en';
    return this.nominatimService.searchAddresses(
      dto.searchQuery,
      dto.limit,
      language,
    );
  }

  @Get('reverse-geocode')
  async getReverseGeocode(
    @Query() dto: ReverseGeocodeDto,
    @Headers('accept-language') headerLanguage?: string,
  ) {
    const language = dto.locale || headerLanguage || 'en';
    return this.nominatimService.getReverseGeocode(dto.lat, dto.lon, language);
  }
  @Post()
  @UseGuards(JwtAuthGuard)
  create(@GetUserId() userId: string, @Body() dto: CreateAddressDto) {
    return this.service.create(userId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@GetUserId() userId: string) {
    return this.service.findAll(userId);
  }

  @Get('default')
  @UseGuards(JwtAuthGuard)
  getDefault(@GetUserId() userId: string) {
    return this.service.getDefault(userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@GetUserId() userId: string, @Param('id') id: string) {
    return this.service.findOne(id, userId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @GetUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.service.update(id, userId, dto);
  }

  @Patch(':id/set-default')
  @UseGuards(JwtAuthGuard)
  setDefault(@GetUserId() userId: string, @Param('id') id: string) {
    return this.service.setDefault(id, userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@GetUserId() userId: string, @Param('id') id: string) {
    return this.service.remove(id, userId);
  }
}
