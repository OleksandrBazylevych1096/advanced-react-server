import {
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class ProductQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  @IsOptional()
  @IsString()
  tagId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => (value ? parseFloat(value as string) : undefined))
  minPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => (value ? parseFloat(value as string) : undefined))
  maxPrice?: number;

  @IsOptional()
  @IsString()
  sortBy?: 'name' | 'price' | 'stock' | 'createdAt' | 'sales' | 'rating' =
    'createdAt';

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Transform(({ value }: { value: string }) => (value ? parseInt(value) : 1))
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Transform(({ value }: { value: string }) => (value ? parseInt(value) : 10))
  limit?: number;
}
