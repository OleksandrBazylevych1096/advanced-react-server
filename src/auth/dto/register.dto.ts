import {
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class RegisterDto {
  @IsOptional()
  @IsEmail()
  @ValidateIf((o) => !o.phone)
  email?: string;

  @IsOptional()
  @IsPhoneNumber()
  @ValidateIf((o) => !o.email)
  phone?: string;

  @IsString()
  @MinLength(6)
  password: string;
}
