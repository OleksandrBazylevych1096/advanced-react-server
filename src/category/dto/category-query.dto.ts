import { IsString, IsOptional } from 'class-validator';

export class CategoryQueryDto {
  @IsString()
  @IsOptional()
  locale?: string = 'en';

  @IsString()
  @IsOptional()
  includeInactive?: boolean;
}
