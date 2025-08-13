import {
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  ValidateIf,
} from 'class-validator';

export class ResendCodeDto {
  @IsOptional()
  @IsEmail()
  @ValidateIf((o) => !o.phone)
  email?: string;

  @IsOptional()
  @IsPhoneNumber()
  @ValidateIf((o) => !o.email)
  phone?: string;
}
