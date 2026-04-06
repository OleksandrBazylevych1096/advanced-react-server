import { IsIn, IsOptional, IsString } from 'class-validator';

export class SendOtpDto {
  @IsString()
  @IsIn([
    'registration_phone_verify',
    'registration_email_verify',
    'login_2fa',
    'two_factor_setup',
    'password_reset',
  ])
  purpose: string;

  @IsOptional()
  @IsString()
  identifier?: string;

  @IsOptional()
  @IsString()
  mfaToken?: string;

  @IsOptional()
  @IsString()
  @IsIn(['sms', 'email'])
  channel?: 'sms' | 'email';
}
