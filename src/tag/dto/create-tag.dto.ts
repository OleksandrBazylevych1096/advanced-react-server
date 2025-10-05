import {
  IsString,
  IsOptional,
  IsBoolean,
  Matches,
  IsArray,
  ValidateNested,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TagTranslationDto } from './tag-translation.dto';

export class CreateTagDto {
  @IsString()
  name: string; // Fallback name

  @IsString()
  slug: string;

  @IsOptional()
  @IsString()
  description?: string; // Fallback description

  @IsOptional()
  @IsString()
  @Matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
    message: 'Color must be a valid hex color code (e.g., #FF5733 or #F53)',
  })
  color?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @ArrayNotEmpty()
  @Type(() => TagTranslationDto)
  translations: TagTranslationDto[];
}
