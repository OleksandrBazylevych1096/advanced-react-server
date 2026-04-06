import { IsString, Matches, MinLength } from 'class-validator';
import { PASSWORD_POLICY_REGEX } from '../auth.constants';

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_POLICY_REGEX)
  newPassword: string;
}

