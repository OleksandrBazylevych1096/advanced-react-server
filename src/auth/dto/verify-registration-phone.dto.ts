import { IsString, Matches } from 'class-validator';

export class VerifyRegistrationPhoneDto {
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone: string;

  @IsString()
  code: string;
}

