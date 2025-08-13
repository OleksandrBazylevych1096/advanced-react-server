import {
  IsString,
  IsOptional,
  IsEmail,
  IsPhoneNumber,
  ValidateIf,
} from 'class-validator';

export class LoginDto {
  @IsOptional()
  @IsEmail()
  @ValidateIf((o) => !o.phone)
  email?: string;

  @IsOptional()
  @IsPhoneNumber()
  @ValidateIf((o) => !o.email)
  phone?: string;

  @IsString()
  password: string;
}
