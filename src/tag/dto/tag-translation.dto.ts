import { IsString, IsOptional } from 'class-validator';

export class TagTranslationDto {
  @IsString()
  locale: string;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;
}
