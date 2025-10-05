import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateProductDto } from './create-product.dto';
import { ProductTranslationDto } from './product-translation.dto';

export class CreateProductI18nDto extends CreateProductDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductTranslationDto)
  @IsOptional()
  translations?: ProductTranslationDto[];
}
