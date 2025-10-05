import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CategoryTranslationDto } from './category-translation.dto';

export class CreateCategoryI18nDto {
  @IsString()
  name!: string; // Default name (fallback)

  @IsString()
  @IsOptional()
  description?: string; // Default description (fallback)

  @IsString()
  slug!: string; // Default slug (fallback)

  @IsString()
  @IsOptional()
  image?: string;

  @IsString()
  @IsOptional()
  parentId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryTranslationDto)
  translations!: CategoryTranslationDto[];
}
