import { IsString, IsOptional } from 'class-validator';
import { ProductQueryDto } from './product-query.dto';

export class ProductQueryI18nDto extends ProductQueryDto {
  @IsString()
  @IsOptional()
  locale?: string = 'en';

  @IsString()
  @IsOptional()
  currency?: string = 'USD';
}
