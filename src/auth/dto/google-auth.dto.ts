import { IsString, IsEmail } from 'class-validator';

export class GoogleAuthDto {
  @IsString()
  googleId: string;

  @IsEmail()
  email: string;
}
