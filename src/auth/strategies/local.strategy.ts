// auth/strategies/local.strategy.ts
import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      usernameField: 'email',
      passwordField: 'password',
      passReqToCallback: true,
    });
  }

  async validate(req: any, username: string, password: string): Promise<any> {
    const isEmail = username.includes('@');
    const loginDto = isEmail
      ? { email: username, password }
      : { phone: username, password };

    return this.authService.validateUser(loginDto);
  }
}
