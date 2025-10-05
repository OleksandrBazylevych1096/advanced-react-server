import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreatePromoBannerDto {
  @IsString()
  imageUrl: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  link?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
