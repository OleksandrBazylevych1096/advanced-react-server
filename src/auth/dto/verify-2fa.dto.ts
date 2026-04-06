import { IsIn, IsString } from 'class-validator';

export class Verify2faDto {
  @IsString()
  mfaToken: string;

  @IsString()
  @IsIn(['totp', 'otp_email', 'otp_sms', 'backup_code'])
  method: 'totp' | 'otp_email' | 'otp_sms' | 'backup_code';

  @IsString()
  code: string;
}

