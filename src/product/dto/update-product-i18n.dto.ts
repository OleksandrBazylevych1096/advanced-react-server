import { PartialType } from '@nestjs/mapped-types';
import { CreateProductI18nDto } from './create-product-i18n.dto';

export class UpdateProductI18nDto extends PartialType(CreateProductI18nDto) {}
