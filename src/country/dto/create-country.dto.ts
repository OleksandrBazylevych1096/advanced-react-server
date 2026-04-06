import { IsString, IsBoolean, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class CountryTranslationDto {
  @IsString()
  locale: string;

  @IsString()
  name: string;
}

export class CreateCountryDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CountryTranslationDto)
  translations: CountryTranslationDto[];
}
