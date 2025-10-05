import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
  Min,
  IsDecimal,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateProductImageDto {
  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  alt?: string;

  @IsOptional()
  @IsBoolean()
  isMain?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  order?: number;
}

export class CreateProductDto {
  @IsString()
  name: string;

  @IsString()
  slug: string;

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Transform(({ value }): number => Number(value))
  price: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }): number | undefined =>
    value ? Number(value) : undefined,
  )
  oldPrice?: number;

  @IsNumber()
  @Min(0)
  @Transform(({ value }): number => Number(value))
  stock: number;

  @IsArray()
  @IsString({ each: true })
  categoryIds: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductImageDto)
  images?: CreateProductImageDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
}
