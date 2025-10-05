import { IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class ReviewQueryDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  @Transform(({ value }) => (value ? parseInt(value) : undefined))
  rating?: number;

  @IsOptional()
  @IsString()
  sortBy?: 'createdAt' | 'rating' | 'helpful';

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => (value ? parseInt(value) : 1))
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => (value ? parseInt(value) : 10))
  limit?: number;
}
