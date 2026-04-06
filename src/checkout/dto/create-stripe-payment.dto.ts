import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';

export enum StripeCreateMode {
  PAYMENT_INTENT = 'payment_intent',
  SESSION = 'session',
}

export class CreateStripePaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  currency?: string;

  @IsOptional()
  @IsEnum(StripeCreateMode)
  mode?: StripeCreateMode;

  @IsOptional()
  @IsUrl({
    require_tld: false,
  })
  successUrl?: string;

  @IsOptional()
  @IsUrl({
    require_tld: false,
  })
  cancelUrl?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}
