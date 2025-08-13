import {
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';

export class VerifyCodeDto {
  @IsString()
  @Length(4, 4)
  code: string;

  @IsOptional()
  @IsEmail()
  @ValidateIf((o) => !o.phone)
  email?: string;

  @IsOptional()
  @IsPhoneNumber()
  @ValidateIf((o) => !o.email)
  phone?: string;
}
