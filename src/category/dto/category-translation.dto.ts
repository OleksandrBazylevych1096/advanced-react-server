import { IsString, IsOptional } from 'class-validator';

export class CategoryTranslationDto {
  @IsString()
  locale!: string;

  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  slug!: string;
}
