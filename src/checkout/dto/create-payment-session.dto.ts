import {
  IsNumber,
  IsDateString,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreatePaymentSessionDto {
  @IsString()
  @MinLength(1, { message: 'Shipping address is required' })
  @MaxLength(255)
  shippingAddress: string;

  @IsString()
  @MinLength(1, { message: 'Shipping city is required' })
  @MaxLength(100)
  shippingCity: string;

  @IsString()
  @MinLength(1, { message: 'Shipping country is required' })
  @MaxLength(100)
  shippingCountry: string;

  @IsString()
  @MinLength(1, { message: 'Shipping postal code is required' })
  @MaxLength(20)
  shippingPostal: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  shippingNumberOfApartment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  billingAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingCountry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  billingPostal?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'deliveryTime must be in HH:mm format',
  })
  deliveryTime?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  couponCode?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : Number(value),
  )
  @IsNumber()
  @Min(0)
  tipAmount?: number;

  @IsOptional()
  @IsUrl({ require_protocol: true, require_tld: false })
  successUrl?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, require_tld: false })
  cancelUrl?: string;
}
