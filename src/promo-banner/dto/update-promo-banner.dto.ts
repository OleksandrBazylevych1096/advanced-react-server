import { PartialType } from '@nestjs/mapped-types';
import { CreatePromoBannerDto } from './create-promo-banner.dto';

export class UpdatePromoBannerDto extends PartialType(CreatePromoBannerDto) {}
