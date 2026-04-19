import { IsString, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';

export class CreateAddressDto {
  @IsString()
  @IsNotEmpty()
  streetAddress: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  country?: string;

  @IsString()
  @IsNotEmpty()
  numberOfApartment: string;

  @IsString()
  @IsNotEmpty()
  zipCode: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsOptional()
  latitude?: number;

  @IsOptional()
  longitude?: number;
}
