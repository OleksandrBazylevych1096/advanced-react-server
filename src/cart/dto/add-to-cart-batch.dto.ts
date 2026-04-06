import { IsArray, ValidateNested, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

class CartBatchItemDto {
  @IsString()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class AddToCartBatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartBatchItemDto)
  items: CartBatchItemDto[];
}
