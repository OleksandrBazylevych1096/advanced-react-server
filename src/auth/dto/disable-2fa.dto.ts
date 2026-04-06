import { IsOptional, IsString } from 'class-validator';

export class Disable2faDto {
  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  code?: string;
}

