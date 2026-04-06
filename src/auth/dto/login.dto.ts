import {
  IsString,
  IsOptional,
  IsEmail,
  IsPhoneNumber,
  ValidateIf,
} from 'class-validator';

export class LoginDto {
  @IsOptional()
  @IsString()
  identifier?: string;

  @IsOptional()
  @IsEmail()
  @ValidateIf((o) => !o.phone && !o.identifier)
  email?: string;

  @IsOptional()
  @IsPhoneNumber()
  @ValidateIf((o) => !o.email && !o.identifier)
  phone?: string;

  @IsString()
  password: string;
}
